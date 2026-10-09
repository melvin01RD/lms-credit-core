
import { prisma } from "../db/prisma";
import { UserRole, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import {UserNotFoundError,DuplicateEmailError,InvalidCredentialsError,UserInactiveError,InvalidPasswordError,CannotDeactivateSelfError,} from "../errors";  

// ============================================
// INTERFACES
// ============================================

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordInput {
  userId: string;
  newPassword: string;
  resetById: string;
}

export interface UserFilters {
  role?: UserRole;
  active?: boolean;
  search?: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
}

type SafeUser = Omit<NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>, "password"> & {
  password?: never;
};

// ============================================
// CONSTANTS
// ============================================

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// ============================================
// VALIDATION
// ============================================

function validateEmail(email: string): void {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InvalidCredentialsError();
  }
}

function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new InvalidPasswordError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
    );
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
    throw new InvalidPasswordError(
      "La contraseña debe contener al menos una mayúscula, una minúscula y un número"
    );
  }
}

function validateName(name: string, field: string): void {
  if (!name || name.trim().length < 2) {
    throw new InvalidPasswordError(`El ${field} debe tener al menos 2 caracteres`);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function sanitizeUser(user: Awaited<ReturnType<typeof prisma.user.findUnique>>): SafeUser | null {
  if (!user) return null;

  const { password, ...safeUser } = user;
  return safeUser as SafeUser;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ============================================
// USER OPERATIONS
// ============================================

export async function createUser(data: CreateUserInput): Promise<SafeUser> {
  validateEmail(data.email);
  validatePassword(data.password);
  validateName(data.firstName, "nombre");
  validateName(data.lastName, "apellido");

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
  });

  if (existingUser) {
    throw new DuplicateEmailError(data.email);
  }

  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      password: hashedPassword,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      role: data.role ?? UserRole.OPERATOR,
    },
  });

  return sanitizeUser(user)!;
}

export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
  validateEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  if (!user.active) {
    throw new UserInactiveError(user.id);
  }

  const isValidPassword = await verifyPassword(password, user.password);

  if (!isValidPassword) {
    throw new InvalidCredentialsError();
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

export async function getUserById(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  return sanitizeUser(user)!;
}

export async function getUserByEmail(email: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    throw new UserNotFoundError(email);
  }

  return sanitizeUser(user)!;
}

export async function getUsers(filters?: UserFilters) {
  const where: Prisma.UserWhereInput = {};

  if (filters?.role) {
    where.role = filters.role;
  }

  if (filters?.active !== undefined) {
    where.active = filters.active;
  }

  if (filters?.search) {
    const searchTerm = filters.search.trim();
    where.OR = [
      { firstName: { contains: searchTerm, mode: "insensitive" } },
      { lastName: { contains: searchTerm, mode: "insensitive" } },
      { email: { contains: searchTerm, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          createdLoans: true,
          payments: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return users;
}

export async function updateUser(userId: string, data: UpdateUserInput): Promise<SafeUser> {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    throw new UserNotFoundError(userId);
  }

  if (data.email && data.email.toLowerCase() !== existingUser.email) {
    validateEmail(data.email);

    const emailInUse = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (emailInUse) {
      throw new DuplicateEmailError(data.email);
    }
  }

  if (data.firstName) validateName(data.firstName, "nombre");
  if (data.lastName) validateName(data.lastName, "apellido");

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: data.firstName?.trim(),
      lastName: data.lastName?.trim(),
      email: data.email?.toLowerCase().trim(),
    },
  });

  return sanitizeUser(user)!;
}

export async function changePassword(data: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user) {
    throw new UserNotFoundError(data.userId);
  }

  const isValidPassword = await verifyPassword(data.currentPassword, user.password);

  if (!isValidPassword) {
    throw new InvalidCredentialsError();
  }

  validatePassword(data.newPassword);

  const hashedPassword = await hashPassword(data.newPassword);

  await prisma.user.update({
    where: { id: data.userId },
    data: { password: hashedPassword },
  });
}

export async function resetPassword(data: ResetPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user) {
    throw new UserNotFoundError(data.userId);
  }

  validatePassword(data.newPassword);

  const hashedPassword = await hashPassword(data.newPassword);

  await prisma.user.update({
    where: { id: data.userId },
    data: { password: hashedPassword },
  });
}

export async function updateUserRole(
  userId: string,
  newRole: UserRole,
  updatedById: string
): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  if (userId === updatedById) {
    throw new CannotDeactivateSelfError();
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  });

  return sanitizeUser(updatedUser)!;
}

export async function deactivateUser(userId: string, deactivatedById: string): Promise<SafeUser> {
  if (userId === deactivatedById) {
    throw new CannotDeactivateSelfError();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { active: false },
  });

  return sanitizeUser(updatedUser)!;
}

export async function reactivateUser(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { active: true },
  });

  return sanitizeUser(updatedUser)!;
}

export async function getUserStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new UserNotFoundError(userId);
  }

  const [loansCreated, paymentsProcessed, totalLoanAmount] = await Promise.all([
    prisma.loan.count({
      where: { createdById: userId },
    }),
    prisma.payment.count({
      where: { createdById: userId },
    }),
    prisma.loan.aggregate({
      where: { createdById: userId },
      _sum: { principalAmount: true },
    }),
  ]);

  return {
    userId,
    loansCreated,
    paymentsProcessed,
    totalLoanAmount: Number(totalLoanAmount._sum.principalAmount ?? 0),
  };
}

export async function isEmailRegistered(email: string, excludeUserId?: string): Promise<boolean> {
  const where: Prisma.UserWhereInput = {
    email: email.toLowerCase(),
  };

  if (excludeUserId) {
    where.id = { not: excludeUserId };
  }

  const count = await prisma.user.count({ where });
  return count > 0;
}
