import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly tokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Register ─────────────────────────────────────────────
  // Creates the user in an unverified state and sends a code.
  // The user must call /auth/verify before they can log in.

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { code, codeHash, expiresAt } = this.generateVerificationCode();

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      isVerified: false,
      verificationCodeHash: codeHash,
      verificationCodeExpiresAt: expiresAt,
    });

    await this.userRepo.save(user);

    // In production: pass `code` to a mail service here.
    // Returned directly in dev so you can test without an SMTP server.
    return {
      message:
        'Registration successful. Check your email for a verification code.',
      ...(this.config.get('NODE_ENV') !== 'production' && { devCode: code }),
    };
  }

  // ── Verify ───────────────────────────────────────────────
  // Validates the 6-digit code. On success, marks the user as
  // verified and immediately returns a token pair so the user
  // is logged in without an extra round-trip.

  async verify(dto: VerifyDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });

    if (
      !user ||
      !user.verificationCodeHash ||
      !user.verificationCodeExpiresAt
    ) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    if (user.verificationCodeExpiresAt < new Date()) {
      throw new UnauthorizedException('Verification code has expired');
    }

    const codeHash = this.hashString(dto.code);
    const valid = codeHash === user.verificationCodeHash;
    if (!valid)
      throw new UnauthorizedException('Invalid or expired verification code');

    await this.userRepo.update(user.id, {
      isVerified: true,
      verificationCodeHash: null,
      verificationCodeExpiresAt: null,
    });

    return this.issueTokenPair(user);
  }

  // ── Resend verification code ─────────────────────────────

  async resendVerification(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });

    // Always return the same message to avoid user enumeration
    if (!user || user.isVerified) {
      return {
        message:
          'If that email exists and is unverified, a new code has been sent.',
      };
    }

    const { code, codeHash, expiresAt } = this.generateVerificationCode();
    await this.userRepo.update(user.id, {
      verificationCodeHash: codeHash,
      verificationCodeExpiresAt: expiresAt,
    });

    // In production: send email with `code` here.
    return {
      message:
        'If that email exists and is unverified, a new code has been sent.',
      ...(this.config.get('NODE_ENV') !== 'production' && { devCode: code }),
    };
  }

  // ── Login ────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new ForbiddenException('Account is deactivated');

    if (!user.isVerified) {
      throw new ForbiddenException(
        'Email not verified. Please verify your account before logging in.',
      );
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    return this.issueTokenPair(user);
  }

  // ── Refresh ──────────────────────────────────────────────
  // Rotates the refresh token: revokes the old one, issues a new pair.
  // This limits the window of damage if a refresh token is stolen.

  async refresh(rawToken: string) {
    const tokenHash = this.hashString(rawToken);
    const stored = await this.tokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.tokenRepo.update(stored.id, { revokedAt: new Date() });
    return this.issueTokenPair(stored.user);
  }

  // ── Logout ───────────────────────────────────────────────

  async logout(rawToken: string) {
    const tokenHash = this.hashString(rawToken);
    await this.tokenRepo.update({ tokenHash }, { revokedAt: new Date() });
  }

  // ── Private helpers ──────────────────────────────────────

  private async issueTokenPair(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload); // TTL comes from JwtModule config

    const rawRefresh = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashString(rawRefresh);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.tokenRepo.save(
      this.tokenRepo.create({ user, tokenHash, expiresAt }),
    );

    return { accessToken, refreshToken: rawRefresh };
  }

  private generateVerificationCode() {
    // 6-digit numeric code
    const code = String(crypto.randomInt(100_000, 999_999));
    const codeHash = this.hashString(code);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15-minute window

    return { code, codeHash, expiresAt };
  }

  private hashString(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
