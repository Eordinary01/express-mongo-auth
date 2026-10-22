const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User } = require('../src/models/User');

let mongod;

const validUser = { name: 'Alice', email: 'Alice@Example.com', password: 'Password1' };

const register = (body = validUser) => request(app).post('/api/auth/register').send(body);
const login = (email = validUser.email, password = validUser.password) =>
  request(app).post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDB(mongod.getUri());
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await disconnectDB();
  await mongod.stop();
});

describe('POST /api/auth/register', () => {
  it('creates a user, hashes the password and returns tokens', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Alice', email: 'alice@example.com', role: 'user' });
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken=.*HttpOnly/);

    const stored = await User.findOne({ email: 'alice@example.com' }).select('+password');
    expect(stored.password).not.toBe(validUser.password);
  });

  it('ignores a client-supplied role', async () => {
    const res = await register({ ...validUser, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    await register();
    const res = await register({ ...validUser, email: 'alice@example.com' });
    expect(res.status).toBe(409);
  });

  it('validates input', async () => {
    const res = await register({ name: '', email: 'not-an-email', password: 'weak' });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => register());

  it('logs in with valid credentials', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects a wrong password', async () => {
    const res = await login(validUser.email, 'WrongPass1');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('rejects an unknown email with the same message', async () => {
    const res = await login('nobody@example.com', 'Password1');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user with a valid token', async () => {
    const { body } = await register();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });
});

describe('refresh token rotation', () => {
  it('rotates refresh tokens and detects reuse', async () => {
    const { body } = await register();
    const first = body.refreshToken;

    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: first });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(first);

    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken: first });
    expect(reused.status).toBe(401);
    expect(reused.body.message).toMatch(/reuse detected/);

    const afterRevoke = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken });
    expect(afterRevoke.status).toBe(401);
  });

  it('accepts the refresh token from the httpOnly cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validUser);
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('logout invalidates the refresh token', async () => {
    const { body } = await register();
    await request(app).post('/api/auth/logout').send({ refreshToken: body.refreshToken });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: body.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('session revocation', () => {
  const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

  it('logout-all invalidates existing access and refresh tokens', async () => {
    const { body } = await register();
    const second = (await login()).body;

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);

    expect((await me(body.accessToken)).status).toBe(401);
    expect((await me(second.accessToken)).status).toBe(401);
    for (const refreshToken of [body.refreshToken, second.refreshToken]) {
      const r = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(r.status).toBe(401);
    }

    const stored = await User.findById(body.user.id).select('+refreshTokens');
    expect(stored.refreshTokens).toHaveLength(0);
  });

  it('keeps at most 5 refresh tokens per user', async () => {
    await register();
    for (let i = 0; i < 6; i += 1) await login();
    const stored = await User.findOne({ email: 'alice@example.com' }).select('+refreshTokens');
    expect(stored.refreshTokens).toHaveLength(5);
  });
});

describe('PATCH /api/auth/password', () => {
  it('changes the password and revokes old sessions', async () => {
    const { body } = await register();
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ currentPassword: 'Password1', newPassword: 'NewPassword2' });
    expect(res.status).toBe(200);

    expect((await login()).status).toBe(401);
    expect((await login(validUser.email, 'NewPassword2')).status).toBe(200);

    const old = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: body.refreshToken });
    expect(old.status).toBe(401);

    const oldAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(oldAccess.status).toBe(401);

    const newAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(newAccess.status).toBe(200);
  });
});

describe('role-based authorization (/api/users)', () => {
  let userToken;
  let adminToken;
  let userId;

  beforeEach(async () => {
    const userRes = await register();
    userToken = userRes.body.accessToken;
    userId = userRes.body.user.id;

    await User.create({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'AdminPass1',
      role: 'admin',
    });
    adminToken = (await login('admin@example.com', 'AdminPass1')).body.accessToken;
  });

  it('forbids regular users', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('allows admins to list users', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.users[0].password).toBeUndefined();
  });

  it('paginates and rejects non-integer pagination params', async () => {
    const ok = await request(app)
      .get('/api/users?page=2&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(ok.body.users).toHaveLength(1);

    for (const qs of ['page=1.5', 'limit=2.5', 'page=0', 'limit=abc', 'limit=101']) {
      const res = await request(app)
        .get(`/api/users?${qs}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    }
  });

  it('allows admins to change roles', async () => {
    const res = await request(app)
      .patch(`/api/users/${userId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects invalid roles and ids', async () => {
    const badRole = await request(app)
      .patch(`/api/users/${userId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'superuser' });
    expect(badRole.status).toBe(400);

    const badId = await request(app)
      .get('/api/users/not-an-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(badId.status).toBe(400);
  });

  it('allows admins to delete users', async () => {
    const res = await request(app)
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
    expect(await User.findById(userId)).toBeNull();
  });
});

describe('demo frontend', () => {
  it('serves the demo client at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Express Mongo Auth');
  });
});
