# Design Document: Syntek Autopilot Production Transformation

## Introduction

This document provides the comprehensive technical design for transforming the Syntek Autopilot MVP into a production-ready, enterprise-grade B2B outreach automation platform. The design addresses 16 critical transformation areas covering UI/UX modernization, authentication, error handling, performance optimization, security hardening, code architecture, testing, analytics, deployment infrastructure, documentation, and feature enhancements.

The design follows modern software architecture principles including separation of concerns, dependency injection, event-driven patterns, and microservices-ready modular structure. All components are designed for scalability, maintainability, testability, and security.

## Technology Stack

### Frontend Stack
- **Framework**: React 19.2.6 with React DOM
- **Build Tool**: Vite 8.0.12 for fast development and optimized production builds
- **Type Safety**: TypeScript with strict mode enabled
- **State Management**: React Context API + Custom Hooks for local/global state
- **Styling**: CSS Modules + Tailwind CSS for utility-first styling with design tokens
- **UI Components**: Custom component library built on design system
- **HTTP Client**: Fetch API with custom wrapper for request/response handling
- **Form Handling**: React Hook Form for performant form validation
- **Data Visualization**: Recharts for analytics charts and graphs
- **Date Handling**: date-fns for lightweight date manipulation
- **Icons**: Heroicons or Lucide React for consistent iconography

### Backend Stack
- **Runtime**: Node.js 18+ with ES Modules
- **Framework**: Express 5.2.1 for REST API server
- **Database**: PostgreSQL 14+ for relational data storage
- **Caching**: Redis 7+ for session storage, API caching, and job queues
- **ORM**: pg (node-postgres) with custom repository pattern
- **Authentication**: JWT with bcrypt password hashing (12 rounds)
- **Email**: Nodemailer 8.0.7 for SMTP outreach, ImapFlow 1.3.3 for inbox sync
- **AI Integration**: Google Gemini API for personalized content generation
- **OAuth**: Google OAuth 2.0 for Calendar and Gmail integration
- **Job Queue**: Bull for background task processing (scraping, campaigns, sync)
- **Validation**: Joi for request payload validation
- **Logging**: Winston for structured logging with log rotation
- **Monitoring**: Prometheus client for metrics export

### DevOps & Infrastructure
- **Containerization**: Docker with multi-stage builds
- **Orchestration**: Docker Compose for local development, Kubernetes-ready
- **CI/CD**: GitHub Actions for automated testing and deployment
- **Reverse Proxy**: Nginx for load balancing and SSL termination
- **SSL**: Let's Encrypt for automated certificate management
- **Database Migrations**: node-pg-migrate for versioned schema changes
- **Secrets Management**: Environment variables with .env files (dev) and Vault (production)
- **Monitoring**: Grafana + Prometheus for metrics, ELK stack for log aggregation
- **Backup**: Automated PostgreSQL dumps with S3 storage

## High-Level System Architecture


### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React SPA (Vite)                                        │   │
│  │  - Dashboard  - LeadFinder  - Campaigns  - Inbox       │   │
│  │  - Pipeline   - Analytics   - Settings   - Auth         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │ HTTPS/REST
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Nginx Reverse Proxy                                     │   │
│  │  - Load Balancing  - SSL Termination  - Rate Limiting   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Express API Server (Node.js)                           │   │
│  │  ┌─────────────┬─────────────┬──────────────┐          │   │
│  │  │ Auth Service│ Lead Service│ Campaign Svc │          │   │
│  │  ├─────────────┼─────────────┼──────────────┤          │   │
│  │  │ Inbox Svc   │ Pipeline Svc│ Analytics Svc│          │   │
│  │  ├─────────────┼─────────────┼──────────────┤          │   │
│  │  │ Settings Svc│ Scraper Svc │ AI Generator │          │   │
│  │  └─────────────┴─────────────┴──────────────┘          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                  │                │                 │
       ┌──────────┴────────┐      │      ┌──────────┴───────────┐
       ↓                   ↓       ↓      ↓                      ↓
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ PostgreSQL   │   │   Redis      │   │  Bull Queue  │   │ File Storage │
│ - users      │   │ - Sessions   │   │ - Scrape jobs│   │ - Exports    │
│ - leads      │   │ - Cache      │   │ - Campaign   │   │ - Logs       │
│ - emails     │   │ - Rate limit │   │ - Inbox sync │   │              │
│ - campaigns  │   │              │   │              │   │              │
│ - settings   │   │              │   │              │   │              │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘

                  │                        │                       │
       ┌──────────┴────────────┬──────────┴──────────┬───────────┴──────┐
       ↓                       ↓                     ↓                   ↓
┌──────────────┐      ┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│ Google       │      │ Gmail SMTP/  │     │ Gemini AI    │    │ Google Maps/ │
│ Calendar API │      │ IMAP         │     │ API          │    │ Yelp Scraping│
└──────────────┘      └──────────────┘     └──────────────┘    └──────────────┘
```

### Architecture Principles

1. **Layered Architecture**: Clear separation between presentation (React), business logic (Services), data access (Repositories), and external integrations
2. **Multi-Tenancy**: User ID isolation enforced at database query level for complete data segregation
3. **Service-Oriented**: Each domain (Auth, Leads, Campaigns, Inbox) implemented as independent service module
4. **Stateless API**: All state stored in database/Redis, enabling horizontal scaling
5. **Asynchronous Processing**: Long-running tasks (scraping, campaigns) handled via job queues
6. **Event-Driven**: Internal events for cross-service communication (e.g., lead_discovered, email_sent)
7. **Fail-Safe**: Graceful degradation with retry logic, circuit breakers, and fallback mechanisms
8. **Observable**: Structured logging, metrics export, and distributed tracing ready

## Component Architecture

### 1. Design System & UI Components

**Purpose**: Provide consistent, reusable, and themeable UI components following atomic design principles.

**Structure**:

```
src/
├── design-system/
│   ├── tokens.ts              # Design tokens (colors, spacing, typography)
│   ├── themes.ts              # Light/Dark theme definitions
│   └── globals.css            # Global CSS variables and resets
├── components/
│   ├── atoms/                 # Basic building blocks
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   ├── Icon.tsx
│   │   ├── Spinner.tsx
│   │   └── Tooltip.tsx
│   ├── molecules/             # Composite components
│   │   ├── FormField.tsx
│   │   ├── SearchBar.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── Dropdown.tsx
│   ├── organisms/             # Complex components
│   │   ├── Navbar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── DataTable.tsx
│   │   ├── KanbanBoard.tsx
│   │   └── ChartWidget.tsx
│   └── templates/             # Page layouts
│       ├── DashboardLayout.tsx
│       └── AuthLayout.tsx
```

**Design Token System** (`design-system/tokens.ts`):

```typescript
export const tokens = {
  colors: {
    primary: { 50: '#eff6ff', 100: '#dbeafe', /* ... */, 900: '#1e3a8a' },
    success: { /* green shades */ },
    error: { /* red shades */ },
    warning: { /* amber shades */ },
    neutral: { /* gray shades */ }
  },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', xxl: '48px' },
  typography: {
    fontFamily: { sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace' },
    fontSize: { xs: '12px', sm: '14px', base: '16px', lg: '18px', xl: '20px', '2xl': '24px' },
    fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '700' },
    lineHeight: { tight: '1.25', normal: '1.5', relaxed: '1.75' }
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1)',
    xl: '0 20px 25px -5px rgba(0,0,0,0.1)'
  },
  borderRadius: { sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  transitions: { fast: '150ms', base: '250ms', slow: '400ms' }
};
```

**Theme System** (`design-system/themes.ts`):

```typescript
export const lightTheme = {
  background: { primary: tokens.colors.neutral[50], secondary: tokens.colors.neutral[100] },
  text: { primary: tokens.colors.neutral[900], secondary: tokens.colors.neutral[600] },
  border: tokens.colors.neutral[200],
  // ... additional theme properties
};

export const darkTheme = {
  background: { primary: tokens.colors.neutral[900], secondary: tokens.colors.neutral[800] },
  text: { primary: tokens.colors.neutral[50], secondary: tokens.colors.neutral[300] },
  border: tokens.colors.neutral[700],
  // ... additional theme properties
};
```

**Glassmorphism Effect** (Applied to Cards, Modals):

```css
.glass-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
}
```


**Key Components**:

1. **Button Component** (`components/atoms/Button.tsx`):
   - Variants: primary, secondary, outline, ghost, danger
   - Sizes: sm (36px), md (44px), lg (52px)
   - States: default, hover, active, disabled, loading
   - Supports icons, full-width, and custom styling

2. **Toast Notification System** (`components/molecules/Toast.tsx`):
   - Toast Provider Context managing notification queue
   - Auto-dismiss after 4 seconds (success) or manual dismiss (error)
   - Positioned top-right with slide-in animation
   - Variants: success (green), error (red), warning (amber), info (blue)

3. **Modal Component** (`components/molecules/Modal.tsx`):
   - Overlay with backdrop blur and glassmorphism
   - Trap focus within modal, Esc key to close
   - Slide-up entrance animation
   - Supports header, body, footer slots

4. **Loading Skeleton** (`components/atoms/Skeleton.tsx`):
   - Animated shimmer effect
   - Variants: text (single line), paragraph (multiple lines), circular, rectangular
   - Used during data fetching for perceived performance

5. **Empty State Component** (`components/molecules/EmptyState.tsx`):
   - Illustration + heading + description + call-to-action button
   - Context-aware messages (e.g., "No leads yet", "Inbox is empty")

### 2. Authentication & Authorization System

**Purpose**: Secure user registration, login, session management, and multi-tenant data isolation.

**Architecture**:

```
Backend:
├── services/
│   └── auth/
│       ├── AuthService.ts          # Registration, login, token management
│       ├── PasswordService.ts      # Bcrypt hashing and verification
│       ├── TokenService.ts         # JWT generation and validation
│       └── OAuthService.ts         # Google OAuth flow handling
├── middleware/
│   ├── authenticate.ts             # JWT verification middleware
│   ├── authorize.ts                # Role-based access control
│   └── rateLimiter.ts              # Login attempt rate limiting
└── repositories/
    └── UserRepository.ts           # Database access for users table

Frontend:
├── contexts/
│   └── AuthContext.tsx             # Global auth state management
├── hooks/
│   └── useAuth.ts                  # Auth operations (login, logout, refresh)
├── services/
│   └── authService.ts              # API calls for auth endpoints
└── components/
    └── Auth.tsx                    # Login/Register UI
```

**Database Schema** (`users` table):

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'Freelancer' CHECK (role IN ('Freelancer', 'Agency_Admin', 'Enterprise_Admin')),
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  last_login_at TIMESTAMP,
  last_login_ip INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

**Refresh Tokens** (`refresh_tokens` table):

```sql
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
```

**Password Hashing** (`services/auth/PasswordService.ts`):

```typescript
import bcrypt from 'bcrypt';

export class PasswordService {
  private static SALT_ROUNDS = 12;

  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  static async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static validateStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain a number');
    return { valid: errors.length === 0, errors };
  }
}
```

**JWT Token Service** (`services/auth/TokenService.ts`):

```typescript
import jwt from 'jsonwebtoken';

interface AccessTokenPayload {
  userId: number;
  email: string;
  role: string;
}

export class TokenService {
  private static ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
  private static REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
  private static ACCESS_EXPIRY = '1h';
  private static REFRESH_EXPIRY = '7d';

  static generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.ACCESS_SECRET, { expiresIn: this.ACCESS_EXPIRY });
  }

  static generateRefreshToken(userId: number): string {
    return jwt.sign({ userId }, this.REFRESH_SECRET, { expiresIn: this.REFRESH_EXPIRY });
  }

  static verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      return jwt.verify(token, this.ACCESS_SECRET) as AccessTokenPayload;
    } catch {
      return null;
    }
  }

  static verifyRefreshToken(token: string): { userId: number } | null {
    try {
      return jwt.verify(token, this.REFRESH_SECRET) as { userId: number };
    } catch {
      return null;
    }
  }
}
```

**Authentication Middleware** (`middleware/authenticate.ts`):

```typescript
import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/auth/TokenService';

export interface AuthRequest extends Request {
  userId: number;
  userRole: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);
  const payload = TokenService.verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  (req as AuthRequest).userId = payload.userId;
  (req as AuthRequest).userRole = payload.role;
  next();
}

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as AuthRequest).userRole;
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    next();
  };
}
```

**Rate Limiting** (`middleware/rateLimiter.ts`):

```typescript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please slow down' }
});
```

**Frontend Auth Context** (`contexts/AuthContext.tsx`):

```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

interface User {
  id: number;
  email: string;
  companyName: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, companyName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (token) {
          const userData = await authService.verifyToken(token);
          setUser(userData);
        }
      } catch (error) {
        localStorage.removeItem('accessToken');
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    localStorage.setItem('accessToken', response.accessToken);
    setUser(response.user);
  };

  const logout = async () => {
    await authService.logout();
    localStorage.removeItem('accessToken');
    setUser(null);
  };

  const register = async (email: string, password: string, companyName?: string) => {
    const response = await authService.register(email, password, companyName);
    localStorage.setItem('accessToken', response.accessToken);
    setUser(response.user);
  };

  const refreshSession = async () => {
    const response = await authService.refreshToken();
    localStorage.setItem('accessToken', response.accessToken);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated: !!user, 
      isLoading, 
      login, 
      register, 
      logout, 
      refreshSession 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

### 3. Error Handling Architecture

**Purpose**: Provide consistent, user-friendly error handling with proper logging and recovery mechanisms.

**Structure**:

```
Backend:
├── errors/
│   ├── AppError.ts                 # Base error class
│   ├── ValidationError.ts          # 400 validation errors
│   ├── AuthenticationError.ts      # 401 auth errors
│   ├── AuthorizationError.ts       # 403 permission errors
│   ├── NotFoundError.ts            # 404 resource not found
│   └── DatabaseError.ts            # 500 database errors
├── middleware/
│   ├── errorHandler.ts             # Global error handling middleware
│   └── logger.ts                   # Winston logging configuration
└── utils/
    └── errorMapper.ts              # Maps errors to user-friendly messages

Frontend:
├── errors/
│   └── ErrorBoundary.tsx           # React error boundary component
├── services/
│   └── apiClient.ts                # HTTP client with error handling
└── utils/
    └── errorMessages.ts            # User-friendly error message mapping
```

**Base Error Classes** (`errors/AppError.ts`):

```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(`Database error: ${message}`, 500, false);
  }
}
```

**Global Error Handler** (`middleware/errorHandler.ts`):

```typescript
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from './logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error details
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: (req as any).userId
  });

  // Handle known application errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err instanceof ValidationError && err.fields ? { fields: err.fields } : {})
    });
  }

  // Handle unknown errors (don't leak details)
  return res.status(500).json({
    error: 'An unexpected error occurred. Please try again later.'
  });
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

**Frontend API Client** (`services/apiClient.ts`):

```typescript
import { useToast } from '../hooks/useToast';

interface RequestConfig {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(endpoint: string, config: RequestConfig): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...config,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        }
      });

      if (!response.ok) {
        await this.handleError(response);
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError('Network connection failed. Please check your internet.');
      }
      throw error;
    }
  }

  private async handleError(response: Response) {
    const errorData = await response.json().catch(() => ({}));
    
    switch (response.status) {
      case 400:
        throw new ValidationError(errorData.error || 'Invalid request', errorData.fields);
      case 401:
        // Clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        throw new AuthenticationError(errorData.error);
      case 403:
        throw new AuthorizationError(errorData.error || 'Access denied');
      case 404:
        throw new NotFoundError(errorData.error || 'Resource not found');
      case 429:
        throw new RateLimitError('Too many requests. Please try again later.');
      case 500:
      default:
        throw new ServerError(errorData.error || 'Server error occurred');
    }
  }

  async get<T>(endpoint: string, headers = {}): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  async post<T>(endpoint: string, body: any, headers = {}): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  }

  async put<T>(endpoint: string, body: any, headers = {}): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
  }

  async delete<T>(endpoint: string, headers = {}): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

export const apiClient = new ApiClient(import.meta.env.VITE_API_URL);
```

**React Error Boundary** (`errors/ErrorBoundary.tsx`):

```typescript
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-fallback">
          <h1>Something went wrong</h1>
          <p>We apologize for the inconvenience. Please refresh the page.</p>
          <button onClick={() => window.location.reload()}>Refresh Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 4. Database Schema & Data Models

**Purpose**: Define comprehensive multi-tenant data schema with proper relationships, indexes, and constraints.

**Enhanced Schema**:

```sql
-- Users table (already defined above)

-- Leads table with enrichment fields
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  city VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  website VARCHAR(255),
  website_status VARCHAR(50) CHECK (website_status IN ('active', 'down', 'no_website', 'unknown')),
  rating NUMERIC(3,1),
  review_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'not_contacted' CHECK (status IN 
    ('not_contacted', 'contacted', 'opened', 'replied', 'interested', 
     'meeting_scheduled', 'closed', 'no_email', 'trashed')),
  instagram VARCHAR(255),
  facebook VARCHAR(255),
  linkedin VARCHAR(255),
  twitter VARCHAR(255),
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 100),
  notes TEXT,
  tags TEXT[],
  deal_value NUMERIC(10,2),
  deal_probability INTEGER CHECK (deal_probability BETWEEN 0 AND 100),
  ai_enabled BOOLEAN DEFAULT TRUE,
  is_opened BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  contacted_at TIMESTAMP,
  opened_at TIMESTAMP,
  replied_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_city ON leads(city);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_quality_score ON leads(quality_score);

-- Campaigns table
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  outreach_style VARCHAR(50) CHECK (outreach_style IN ('casual', 'roi', 'feedback', 'direct')),
  pitch_offer VARCHAR(50),
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  interested_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- Campaign messages (generated emails)
CREATE TABLE campaign_messages (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'failed')),
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaign_messages_campaign_id ON campaign_messages(campaign_id);
CREATE INDEX idx_campaign_messages_lead_id ON campaign_messages(lead_id);
CREATE INDEX idx_campaign_messages_status ON campaign_messages(status);

-- Emails (inbox messages)
CREATE TABLE emails (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  from_name VARCHAR(255),
  from_email VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  subject VARCHAR(255),
  body TEXT,
  preview TEXT,
  category VARCHAR(50) DEFAULT 'system' CHECK (category IN 
    ('interested', 'not_interested', 'question', 'meeting_request', 'system', 'spam')),
  labels TEXT[] DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  time_received TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_lead_id ON emails(lead_id);
CREATE INDEX idx_emails_category ON emails(category);
CREATE INDEX idx_emails_is_read ON emails(is_read);
CREATE INDEX idx_emails_time_received ON emails(time_received);

-- Campaign settings (user preferences)
CREATE TABLE campaign_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Sender profile
  sender_name VARCHAR(100) DEFAULT '',
  sender_role VARCHAR(100) DEFAULT 'Independent Developer',
  sender_type VARCHAR(50) DEFAULT 'developer' CHECK (sender_type IN ('developer', 'agency', 'enterprise')),
  company_name VARCHAR(100) DEFAULT '',
  use_company_branding BOOLEAN DEFAULT FALSE,
  about_text TEXT DEFAULT '',
  portfolio_url VARCHAR(255) DEFAULT '',
  work_samples TEXT DEFAULT '',
  
  -- Social links
  social_linkedin VARCHAR(255) DEFAULT '',
  social_github VARCHAR(255) DEFAULT '',
  social_twitter VARCHAR(255) DEFAULT '',
  
  -- Branding assets
  logo_url VARCHAR(255) DEFAULT '',
  banner_url VARCHAR(255) DEFAULT '',
  profile_icon_url VARCHAR(255) DEFAULT '',
  
  -- Campaign preferences
  outreach_style VARCHAR(50) DEFAULT 'casual' CHECK (outreach_style IN ('casual', 'roi', 'feedback', 'direct')),
  pitch_offer VARCHAR(50) DEFAULT 'whatsapp_bot',
  custom_offer_details TEXT DEFAULT '',
  
  -- Discovery settings
  niche VARCHAR(100) DEFAULT 'Cafes',
  location VARCHAR(100) DEFAULT 'Austin, TX',
  daily_lead_limit INTEGER DEFAULT 8,
  required_contact VARCHAR(50) DEFAULT 'email_or_phone' CHECK (required_contact IN 
    ('email_required', 'phone_required', 'email_or_phone')),
  search_mode VARCHAR(50) DEFAULT 'scraper',
  
  -- Scheduler settings
  schedule_type VARCHAR(50) DEFAULT 'custom' CHECK (schedule_type IN ('daily', 'weekdays_only', 'custom')),
  preferred_time VARCHAR(50) DEFAULT '09:00',
  timezone VARCHAR(50) DEFAULT 'local',
  is_active BOOLEAN DEFAULT FALSE,
  last_cron_run_date TIMESTAMP,
  
  -- Integration credentials (encrypted)
  gmail_user VARCHAR(255) DEFAULT '',
  gmail_pass_encrypted TEXT DEFAULT '',
  gemini_key_encrypted TEXT DEFAULT '',
  
  -- Google OAuth
  google_connected BOOLEAN DEFAULT FALSE,
  google_email VARCHAR(255),
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry BIGINT,
  google_sandbox_mode BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaign_settings_user_id ON campaign_settings(user_id);

-- Activity log for audit trail
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);
```

### 5. Lead Discovery & Enrichment System

**Purpose**: Scrape business leads from Google Maps/Yelp with DeepSearch enrichment for contact information and social profiles.

**Architecture**:

```
services/
├── scraper/
│   ├── ScraperService.ts           # Orchestrates scraping operations
│   ├── GoogleMapsScraper.ts        # Google Maps specific scraper
│   ├── YelpScraper.ts              # Yelp specific scraper
│   ├── DeepSearchService.ts        # Website crawling and enrichment
│   ├── EmailExtractor.ts           # Email pattern matching from HTML
│   ├── SocialMediaDetector.ts     # Social profile URL detection
│   └── LeadScorer.ts               # Quality score calculation
├── queue/
│   └── ScrapeJob.ts                # Bull job for async scraping
└── repositories/
    └── LeadRepository.ts           # Database access for leads
```

**Scraper Service** (`services/scraper/ScraperService.ts`):

```typescript
import { LeadRepository } from '../../repositories/LeadRepository';
import { DeepSearchService } from './DeepSearchService';
import { LeadScorer } from './LeadScorer';

interface ScrapeOptions {
  niche: string;
  location: string;
  limit: number;
  deepSearch: boolean;
  requiredContact: 'email_required' | 'phone_required' | 'email_or_phone';
}

interface ScrapedLead {
  name: string;
  category: string;
  city: string;
  email?: string;
  phone?: string;
  website?: string;
  websiteStatus?: string;
  rating: number;
  reviewCount: number;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  qualityScore?: number;
}

export class ScraperService {
  constructor(
    private leadRepo: LeadRepository,
    private deepSearch: DeepSearchService,
    private scorer: LeadScorer
  ) {}

  async scrapeLeads(userId: number, options: ScrapeOptions): Promise<ScrapedLead[]> {
    const results: ScrapedLead[] = [];
    let discovered = 0;

    // Use appropriate scraper based on configuration
    const rawLeads = await this.scrapeGoogleMaps(options.niche, options.location);

    for (const lead of rawLeads) {
      if (discovered >= options.limit) break;

      // Apply contact requirement filter
      if (!this.meetsContactRequirement(lead, options.requiredContact)) {
        continue;
      }

      // Check for duplicates
      const exists = await this.leadRepo.findByNameAndCity(userId, lead.name, lead.city);
      if (exists) continue;

      // Perform DeepSearch if enabled
      if (options.deepSearch && lead.website) {
        const enriched = await this.deepSearch.enrich(lead);
        Object.assign(lead, enriched);
        lead.qualityScore = this.scorer.calculate(lead);
      }

      // Save to database
      await this.leadRepo.create(userId, lead);
      results.push(lead);
      discovered++;

      // Rate limiting - 2 second delay between requests
      await this.delay(2000);
    }

    return results;
  }

  private meetsContactRequirement(lead: ScrapedLead, requirement: string): boolean {
    switch (requirement) {
      case 'email_required':
        return !!lead.email;
      case 'phone_required':
        return !!lead.phone;
      case 'email_or_phone':
        return !!(lead.email || lead.phone);
      default:
        return true;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async scrapeGoogleMaps(niche: string, location: string): Promise<ScrapedLead[]> {
    // Implementation uses Puppeteer or Playwright for headless browsing
    // Returns array of raw scraped leads
    return [];
  }
}
```

**DeepSearch Service** (`services/scraper/DeepSearchService.ts`):

```typescript
import { EmailExtractor } from './EmailExtractor';
import { SocialMediaDetector } from './SocialMediaDetector';

interface EnrichmentResult {
  email?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  websiteStatus: string;
}

export class DeepSearchService {
  constructor(
    private emailExtractor: EmailExtractor,
    private socialDetector: SocialMediaDetector
  ) {}

  async enrich(lead: { website: string; name: string }): Promise<EnrichmentResult> {
    try {
      // Fetch website HTML
      const response = await fetch(lead.website, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SyntekBot/1.0)' },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        return { websiteStatus: 'down' };
      }

      const html = await response.text();

      // Extract contact email
      const emails = this.emailExtractor.extractFromHTML(html);
      const email = this.selectBestEmail(emails, lead.name);

      // Detect social media profiles
      const socialProfiles = this.socialDetector.detectFromHTML(html);

      return {
        email,
        ...socialProfiles,
        websiteStatus: 'active'
      };
    } catch (error) {
      console.error(`DeepSearch failed for ${lead.website}:`, error);
      return { websiteStatus: 'down' };
    }
  }

  private selectBestEmail(emails: string[], businessName: string): string | undefined {
    // Prioritize info@, contact@, hello@ over generic emails
    const priorityPrefixes = ['info', 'contact', 'hello', 'sales'];
    const domainEmail = emails.find(e => 
      priorityPrefixes.some(prefix => e.toLowerCase().startsWith(prefix))
    );
    return domainEmail || emails[0];
  }
}
```

**Lead Quality Scorer** (`services/scraper/LeadScorer.ts`):

```typescript
interface ScoredLead {
  rating?: number;
  reviewCount?: number;
  website?: string;
  email?: string;
  phone?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
}

export class LeadScorer {
  calculate(lead: ScoredLead): number {
    let score = 0;

    // Rating component (max 30 points)
    if (lead.rating) {
      score += (lead.rating / 5.0) * 30;
    }

    // Review count component (max 20 points)
    if (lead.reviewCount) {
      score += Math.min((lead.reviewCount / 100) * 20, 20);
    }

    // Website presence (10 points)
    if (lead.website) score += 10;

    // Contact availability (20 points)
    if (lead.email) score += 15;
    if (lead.phone) score += 5;

    // Social media presence (max 20 points)
    const socialCount = [lead.instagram, lead.facebook, lead.linkedin].filter(Boolean).length;
    score += (socialCount / 3) * 20;

    return Math.round(Math.min(score, 100));
  }
}
```

### 6. AI Campaign Generation System

**Purpose**: Generate personalized email pitches using Gemini AI with dynamic prompt engineering based on lead data and sender profile.

**Architecture**:

```
services/
├── ai/
│   ├── GeminiService.ts            # Gemini API integration
│   ├── PromptBuilder.ts            # Dynamic prompt construction
│   ├── TemplateEngine.ts           # Variable substitution
│   └── CampaignGenerator.ts        # Orchestrates campaign creation
└── repositories/
    └── CampaignRepository.ts       # Database access for campaigns
```

**Prompt Builder** (`services/ai/PromptBuilder.ts`):

```typescript
interface PromptContext {
  lead: {
    name: string;
    category: string;
    city: string;
    rating?: number;
    reviewCount?: number;
    websiteStatus?: string;
  };
  sender: {
    name: string;
    role: string;
    companyName?: string;
    about?: string;
    portfolioUrl?: string;
    workSamples?: string;
  };
  style: 'casual' | 'roi' | 'feedback' | 'direct';
  offer: 'whatsapp_bot' | 'website_dev' | 'ai_chatbot' | 'custom';
  customOfferDetails?: string;
}

export class PromptBuilder {
  build(context: PromptContext): string {
    const styleInstructions = this.getStyleInstructions(context.style);
    const offerDescription = this.getOfferDescription(context.offer, context.customOfferDetails);
    const websiteContext = this.getWebsiteContext(context.lead.websiteStatus);

    return `You are ${context.sender.name}, a ${context.sender.role}${
      context.sender.companyName ? ` at ${context.sender.companyName}` : ''
    }.

Your task: Write a personalized cold outreach email to ${context.lead.name}, a ${context.lead.category} 
business in ${context.lead.city}.

Business Details:
- Name: ${context.lead.name}
- Category: ${context.lead.category}
- Location: ${context.lead.city}
${context.lead.rating ? `- Rating: ${context.lead.rating}/5 stars (${context.lead.reviewCount} reviews)` : ''}
${websiteContext}

Your Background:
${context.sender.about || 'I specialize in helping local businesses grow through technology.'}
${context.sender.workSamples ? `\nPast Work:\n${context.sender.workSamples}` : ''}
${context.sender.portfolioUrl ? `\nPortfolio: ${context.sender.portfolioUrl}` : ''}

Service Offering:
${offerDescription}

Writing Style:
${styleInstructions}

Requirements:
1. Generate both an email subject line (max 70 characters) and body
2. Make it specific to ${context.lead.name} - reference their business, location, or rating
3. Keep the email concise (200-300 words)
4. Include a clear, low-pressure call-to-action
5. Sound human and authentic, not like a template
6. Format response as JSON: { "subject": "...", "body": "..." }

Generate the email now:`;
  }

  private getStyleInstructions(style: string): string {
    const styles = {
      casual: 'Use a warm, friendly, conversational tone. Sound like a helpful neighbor, not a salesperson.',
      roi: 'Focus on time savings, revenue benefits, and automation value. Be professional and results-oriented.',
      feedback: 'Reference their Google rating positively and offer constructive suggestions. Be complimentary and consultative.',
      direct: 'Mention you have a pre-built demo or prototype ready. Be confident and solution-focused.'
    };
    return styles[style] || styles.casual;
  }

  private getOfferDescription(offer: string, customDetails?: string): string {
    const offers = {
      whatsapp_bot: 'WhatsApp reservation automation and booking bot to handle customer inquiries 24/7',
      website_dev: 'Custom website design and development to establish or improve online presence',
      ai_chatbot: '24/7 AI-powered customer support chatbot to answer questions and capture leads',
      custom: customDetails || 'Custom technology solution tailored to business needs'
    };
    return offers[offer] || offers.custom;
  }

  private getWebsiteContext(websiteStatus?: string): string {
    switch (websiteStatus) {
      case 'no_website':
        return '- Website: None found (opportunity to establish online presence)';
      case 'down':
        return '- Website: Currently not accessible (may need fixing or rebuilding)';
      case 'active':
        return '- Website: Active (opportunity for improvements or additional features)';
      default:
        return '';
    }
  }
}
```

**Gemini Service** (`services/ai/GeminiService.ts`):

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async generateEmail(prompt: string): Promise<{ subject: string; body: string }> {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          subject: parsed.subject,
          body: parsed.body
        };
      }

      // Fallback: attempt to extract subject and body manually
      const lines = text.split('\n').filter(l => l.trim());
      return {
        subject: lines[0]?.replace(/^(Subject:|#)\s*/i, '').trim() || 'Quick Question',
        body: lines.slice(1).join('\n').trim()
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate email content');
    }
  }

  async generateReply(originalEmail: string, context: string): Promise<string> {
    const prompt = `You are replying to this email:

"${originalEmail}"

Context about the sender: ${context}

Write a professional, helpful reply that addresses their inquiry. Keep it concise and friendly.`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }
}
```

### 7. Smart Inbox & Email Management

**Purpose**: Synchronize Gmail inbox, categorize messages, and provide AI-assisted reply generation with meeting booking.

**Architecture**:

```
services/
├── inbox/
│   ├── InboxService.ts             # Orchestrates inbox operations
│   ├── ImapSyncService.ts          # Gmail IMAP synchronization
│   ├── MessageCategorizer.ts       # AI-based email categorization
│   ├── SentimentAnalyzer.ts        # Detect interest level
│   └── MeetingDetector.ts          # Extract meeting requests
├── calendar/
│   └── GoogleCalendarService.ts    # Calendar API integration
└── repositories/
    └── EmailRepository.ts          # Database access for emails
```

**IMAP Sync Service** (`services/inbox/ImapSyncService.ts`):

```typescript
import { ImapFlow } from 'imapflow';

interface SyncResult {
  newMessages: number;
  success: boolean;
  error?: string;
}

export class ImapSyncService {
  async syncInbox(
    gmailUser: string,
    gmailPass: string,
    lastSyncDate?: Date
  ): Promise<{ messages: any[]; success: boolean; error?: string }> {
    let client: ImapFlow | null = null;

    try {
      client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          user: gmailUser,
          pass: gmailPass
        },
        logger: false
      });

      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        // Search for messages since last sync or last 7 days
        const searchDate = lastSyncDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const messages = [];

        for await (const msg of client.fetch(
          { since: searchDate },
          { envelope: true, bodyStructure: true, source: true }
        )) {
          messages.push({
            from: msg.envelope.from[0],
            subject: msg.envelope.subject,
            date: msg.envelope.date,
            messageId: msg.envelope.messageId,
            body: await this.extractTextBody(msg)
          });
        }

        return { messages, success: true };
      } finally {
        lock.release();
      }
    } catch (error: any) {
      console.error('IMAP sync error:', error);
      return { 
        messages: [], 
        success: false, 
        error: error.message 
      };
    } finally {
      if (client) await client.logout();
    }
  }

  private async extractTextBody(message: any): Promise<string> {
    // Extract plain text or convert HTML to text
    // Implementation details omitted for brevity
    return '';
  }
}
```

**Message Categorizer** (`services/inbox/MessageCategorizer.ts`):

```typescript
export type EmailCategory = 'interested' | 'not_interested' | 'question' | 'meeting_request' | 'system' | 'spam';

export class MessageCategorizer {
  categorize(subject: string, body: string): EmailCategory {
    const content = `${subject} ${body}`.toLowerCase();

    // Interested keywords
    const interestedKeywords = [
      'interested', 'sounds good', 'tell me more', 'let\\'s talk', 
      'would like', 'how much', 'pricing', 'demo', 'schedule'
    ];
    if (interestedKeywords.some(kw => content.includes(kw))) {
      return 'interested';
    }

    // Meeting request keywords
    const meetingKeywords = [
      'meeting', 'call', 'zoom', 'calendar', 'available', 'schedule', 
      'book', 'appointment', 'meet'
    ];
    if (meetingKeywords.some(kw => content.includes(kw))) {
      return 'meeting_request';
    }

    // Question keywords
    const questionKeywords = ['?', 'how', 'what', 'when', 'where', 'why', 'can you'];
    if (questionKeywords.some(kw => content.includes(kw))) {
      return 'question';
    }

    // Not interested keywords
    const notInterestedKeywords = [
      'not interested', 'no thanks', 'stop', 'unsubscribe', 'remove', 'don\\'t contact'
    ];
    if (notInterestedKeywords.some(kw => content.includes(kw))) {
      return 'not_interested';
    }

    return 'system';
  }
}
```

### 8. Autopilot Scheduler System

**Purpose**: Autonomous background cron job system for scheduled lead discovery and campaign execution.

**Architecture**:

```
services/
├── scheduler/
│   ├── CronScheduler.ts            # Main scheduler with job orchestration
│   ├── LeadDiscoveryJob.ts         # Scheduled scraping job
│   ├── CampaignSenderJob.ts        # Scheduled email sending job
│   └── InboxSyncJob.ts             # Scheduled inbox synchronization
└── queue/
    └── BullQueueManager.ts         # Redis-backed job queue
```

**Cron Scheduler** (`services/scheduler/CronScheduler.ts`):

```typescript
import { CronJob } from 'cron';
import { LeadDiscoveryJob } from './LeadDiscoveryJob';
import { CampaignSenderJob } from './CampaignSenderJob';
import { InboxSyncJob } from './InboxSyncJob';

export class CronScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private isRunning: Map<string, boolean> = new Map();

  constructor(
    private leadDiscovery: LeadDiscoveryJob,
    private campaignSender: CampaignSenderJob,
    private inboxSync: InboxSyncJob
  ) {}

  startForUser(userId: number, schedule: string, tasks: string[]) {
    const jobId = `user_${userId}`;

    // Prevent duplicate jobs
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId)!.stop();
    }

    const job = new CronJob(schedule, async () => {
      // Skip if previous run still in progress
      if (this.isRunning.get(jobId)) {
        console.log(`Skipping job ${jobId} - previous run still active`);
        return;
      }

      this.isRunning.set(jobId, true);
      
      try {
        if (tasks.includes('lead_discovery')) {
          await this.leadDiscovery.execute(userId);
        }
        
        if (tasks.includes('campaign_sending')) {
          await this.campaignSender.execute(userId);
        }
        
        if (tasks.includes('inbox_sync')) {
          await this.inboxSync.execute(userId);
        }
      } catch (error) {
        console.error(`Cron job error for user ${userId}:`, error);
      } finally {
        this.isRunning.set(jobId, false);
      }
    });

    job.start();
    this.jobs.set(jobId, job);
  }

  stopForUser(userId: number) {
    const jobId = `user_${userId}`;
    const job = this.jobs.get(jobId);
    
    if (job) {
      job.stop();
      this.jobs.delete(jobId);
      this.isRunning.delete(jobId);
    }
  }

  stopAll() {
    this.jobs.forEach(job => job.stop());
    this.jobs.clear();
    this.isRunning.clear();
  }
}
```

### 9. Analytics & Reporting Dashboard

**Purpose**: Provide data-driven insights with visualizations for campaign performance and business metrics.

**Frontend Components**:

```
components/
├── Analytics.tsx                   # Main analytics dashboard
├── widgets/
│   ├── MetricCard.tsx              # KPI display card
│   ├── TrendChart.tsx              # Line chart for trends
│   ├── FunnelChart.tsx             # Conversion funnel
│   ├── HeatMap.tsx                 # Geographic distribution
│   └── PerformanceTable.tsx        # Campaign comparison table
```

**Analytics Service** (`services/analytics/AnalyticsService.ts`):

```typescript
interface DashboardMetrics {
  totalLeads: number;
  leadsTrend: number;
  emailsSent: number;
  deliveryRate: number;
  openRate: number;
  openRateTrend: number;
  replyRate: number;
  replyRateTrend: number;
  pipelineValue: number;
  conversionFunnel: { stage: string; count: number }[];
}

export class AnalyticsService {
  async getDashboardMetrics(userId: number, dateRange: DateRange): Promise<DashboardMetrics> {
    const [leads, emails, pipeline] = await Promise.all([
      this.getLeadMetrics(userId, dateRange),
      this.getEmailMetrics(userId, dateRange),
      this.getPipelineMetrics(userId, dateRange)
    ]);

    return {
      totalLeads: leads.total,
      leadsTrend: leads.trend,
      emailsSent: emails.sent,
      deliveryRate: emails.deliveryRate,
      openRate: emails.openRate,
      openRateTrend: emails.openRateTrend,
      replyRate: emails.replyRate,
      replyRateTrend: emails.replyRateTrend,
      pipelineValue: pipeline.totalValue,
      conversionFunnel: pipeline.funnel
    };
  }

  private async getLeadMetrics(userId: number, dateRange: DateRange) {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= $2 - INTERVAL '7 days') as week_count,
        COUNT(*) FILTER (WHERE created_at >= $2 - INTERVAL '14 days' AND created_at < $2 - INTERVAL '7 days') as prev_week_count
      FROM leads
      WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
    `;
    
    const result = await pool.query(query, [userId, dateRange.start, dateRange.end]);
    const { total, week_count, prev_week_count } = result.rows[0];
    
    const trend = prev_week_count > 0 
      ? ((week_count - prev_week_count) / prev_week_count) * 100 
      : 0;
    
    return { total, trend };
  }

  private async getEmailMetrics(userId: number, dateRange: DateRange) {
    const query = `
      SELECT 
        COUNT(*) as sent,
        COUNT(*) FILTER (WHERE status = 'sent') as delivered,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM emails e WHERE e.user_id = cm.user_id AND e.from_email = l.email
        )) as replied
      FROM campaign_messages cm
      JOIN leads l ON cm.lead_id = l.id
      WHERE cm.user_id = $1 AND cm.sent_at BETWEEN $2 AND $3
    `;
    
    const result = await pool.query(query, [userId, dateRange.start, dateRange.end]);
    const { sent, delivered, opened, replied } = result.rows[0];
    
    return {
      sent,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      openRateTrend: 0, // Calculate based on previous period
      replyRate: sent > 0 ? (replied / sent) * 100 : 0,
      replyRateTrend: 0 // Calculate based on previous period
    };
  }

  private async getPipelineMetrics(userId: number, dateRange: DateRange) {
    const funnelQuery = `
      SELECT status, COUNT(*) as count
      FROM leads
      WHERE user_id = $1
      GROUP BY status
      ORDER BY 
        CASE status
          WHEN 'not_contacted' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'replied' THEN 3
          WHEN 'interested' THEN 4
          WHEN 'meeting_scheduled' THEN 5
          WHEN 'closed' THEN 6
        END
    `;
    
    const funnelResult = await pool.query(funnelQuery, [userId]);
    
    const valueQuery = `
      SELECT COALESCE(SUM(deal_value), 0) as total_value
      FROM leads
      WHERE user_id = $1 AND status = 'closed'
    `;
    
    const valueResult = await pool.query(valueQuery, [userId]);
    
    return {
      funnel: funnelResult.rows.map(r => ({ stage: r.status, count: parseInt(r.count) })),
      totalValue: parseFloat(valueResult.rows[0].total_value)
    };
  }
}
```

### 10. Security Implementation Patterns

**Encryption Service** (`services/security/EncryptionService.ts`):

```typescript
import crypto from 'crypto';

export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor(secretKey: string) {
    // Derive 32-byte key from secret
    this.key = crypto.scryptSync(secretKey, 'salt', 32);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

## API Endpoints Specification

### Authentication Endpoints

```
POST   /api/auth/register          Register new user
POST   /api/auth/login             Login user
POST   /api/auth/logout            Logout user
POST   /api/auth/refresh           Refresh access token
POST   /api/auth/forgot-password   Request password reset
POST   /api/auth/reset-password    Reset password with token
GET    /api/auth/google            Initiate Google OAuth
GET    /api/auth/google/callback   Google OAuth callback
POST   /api/auth/google/disconnect Disconnect Google account
```

### Lead Endpoints

```
GET    /api/leads                  Get all leads (with pagination, filters)
POST   /api/leads                  Create lead manually
GET    /api/leads/:id              Get single lead
PUT    /api/leads/:id              Update lead
DELETE /api/leads/:id              Delete lead
PUT    /api/leads/:id/status       Update lead status
POST   /api/leads/scrape           Initiate lead scraping
GET    /api/leads/export           Export leads to CSV
POST   /api/leads/import           Import leads from CSV
DELETE /api/leads                  Delete all leads
```

### Campaign Endpoints

```
GET    /api/campaigns              Get all campaigns
POST   /api/campaigns              Create campaign
GET    /api/campaigns/:id          Get campaign details
PUT    /api/campaigns/:id          Update campaign
DELETE /api/campaigns/:id          Delete campaign
POST   /api/campaigns/:id/generate Generate email content with AI
POST   /api/campaigns/:id/send     Send campaign emails
GET    /api/campaigns/:id/stats    Get campaign statistics
```

### Inbox Endpoints

```
GET    /api/emails                 Get inbox messages (with filters)
GET    /api/emails/:id             Get single email
PUT    /api/emails/:id             Update email (read status, category, labels)
POST   /api/emails/sync            Sync with Gmail IMAP
POST   /api/emails/:id/reply       Send reply
POST   /api/emails/:id/ai-reply    Generate AI reply suggestion
```

### Analytics Endpoints

```
GET    /api/analytics/dashboard    Get dashboard metrics
GET    /api/analytics/campaigns    Get campaign performance
GET    /api/analytics/funnel       Get conversion funnel data
GET    /api/analytics/geographic   Get lead distribution by location
GET    /api/analytics/trends       Get time-series trends
POST   /api/analytics/export       Export analytics report
```

### Settings Endpoints

```
GET    /api/settings               Get user settings
PUT    /api/settings               Update settings
POST   /api/settings/test-gmail    Test Gmail connection
POST   /api/settings/test-gemini   Test Gemini API key
PUT    /api/settings/scheduler     Update scheduler configuration
```

## Deployment Architecture

### Docker Configuration

**Dockerfile** (Multi-stage build):

```dockerfile
# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build backend
FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
COPY server/package*.json ./
RUN npm ci --only=production

# Stage 3: Production image
FROM node:18-alpine
WORKDIR /app

# Copy backend
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY server/ ./

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./dist

# Install production dependencies
RUN npm ci --only=production

# Security: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 5000

CMD ["node", "server.js"]
```

**docker-compose.yml**:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    networks:
      - syntek-network

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: syntek_db
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    networks:
      - syntek-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - syntek-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - syntek-network

volumes:
  postgres-data:
  redis-data:

networks:
  syntek-network:
    driver: bridge
```

### CI/CD Pipeline (GitHub Actions)

**.github/workflows/deploy.yml**:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t syntek-autopilot:${{ github.sha }} .
      
      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push syntek-autopilot:${{ github.sha }}

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        run: |
          ssh ${{ secrets.STAGING_HOST }} "docker pull syntek-autopilot:${{ github.sha }} && docker-compose up -d"

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to production
        run: |
          ssh ${{ secrets.PROD_HOST }} "docker pull syntek-autopilot:${{ github.sha }} && docker-compose up -d"
```

## Performance Optimization Patterns

### 1. Code Splitting (Frontend)

```typescript
// App.tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./components/Dashboard'));
const LeadFinder = lazy(() => import('./components/LeadFinder'));
const Campaigns = lazy(() => import('./components/Campaigns'));
const Inbox = lazy(() => import('./components/Inbox'));
const Pipeline = lazy(() => import('./components/Pipeline'));
const Analytics = lazy(() => import('./components/Analytics'));
const Settings = lazy(() => import('./components/Settings'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leads" element={<LeadFinder />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### 2. Virtual Scrolling (Large Lists)

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function LeadList({ leads }: { leads: Lead[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Row height
    overscan: 5
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(item => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`
            }}
          >
            <LeadCard lead={leads[item.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 3. Database Query Optimization

```typescript
// Use indexes for frequently queried columns
CREATE INDEX CONCURRENTLY idx_leads_user_status ON leads(user_id, status);
CREATE INDEX CONCURRENTLY idx_emails_user_unread ON emails(user_id, is_read) WHERE is_read = FALSE;

// Use connection pooling
const pool = new Pool({
  max: 50,
  min: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Use prepared statements to prevent SQL injection and improve performance
const getLeadsByStatus = await pool.query(
  'SELECT * FROM leads WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3',
  [userId, status, limit]
);
```

### 4. Redis Caching Strategy

```typescript
export class CacheService {
  private redis: Redis;
  
  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Usage in service
async getLeads(userId: number): Promise<Lead[]> {
  const cacheKey = `leads:${userId}`;
  const cached = await cache.get<Lead[]>(cacheKey);
  
  if (cached) return cached;
  
  const leads = await leadRepo.findByUser(userId);
  await cache.set(cacheKey, leads, 300); // 5 min TTL
  
  return leads;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Theme Persistence Round-Trip

For any theme preference (light or dark), toggling the theme should update the UI immediately and persist to localStorage, and reloading the application should restore the same theme preference.

**Validates: Requirements 1.2**

### Property 2: Loading State Skeleton Display

For any data fetching operation that transitions to loading state, skeleton UI components should be displayed until data arrives or an error occurs.

**Validates: Requirements 1.6**

### Property 3: Toast Notification Type Correctness

For any notification type (success, error, warning, info), the displayed toast should have the appropriate color scheme (green, red, amber, blue) and styling.

**Validates: Requirements 1.7**

### Property 4: Empty List State Display

For any empty data collection (leads, emails, campaigns), the appropriate empty state UI with illustration and call-to-action should be displayed.

**Validates: Requirements 1.12**

### Property 5: Form Validation Error Display

For any invalid form input that fails validation rules, an inline error message should be displayed immediately after blur event with clear recovery guidance.

**Validates: Requirements 1.15**

### Property 6: Password Hash Security

For any user password, the stored hash in the database should be generated using bcrypt with a minimum salt rounds of 12, and should not be reversible to plaintext.

**Validates: Requirements 2.2**

### Property 7: JWT Token Expiration Correctness

For any generated JWT token pair, the access token should expire after 1 hour and the refresh token should expire after 7 days, as encoded in the token payload.

**Validates: Requirements 2.3**

### Property 8: Multi-Tenant Data Isolation

For any authenticated user making a data query, all returned records (leads, campaigns, emails, settings) should only contain records where user_id matches the authenticated user's ID.

**Validates: Requirements 2.7**

### Property 9: Account Lockout After Failed Attempts

For any user account, after 5 consecutive failed login attempts, all subsequent login attempts should be rejected with an appropriate error message for 15 minutes.

**Validates: Requirements 2.8**

### Property 10: Token Invalidation on Logout

For any logout action, all active access tokens and refresh tokens associated with the user session should become invalid and fail verification.

**Validates: Requirements 2.12**

### Property 11: HTTP Error Response Mapping

For any API request that returns an HTTP error status code (400, 401, 403, 404, 500), the client should display the appropriate user-friendly error message and perform the correct action (redirect on 401, show retry on network error).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 12: Debounced Search Input Rate Limiting

For any rapid sequence of search input changes occurring within 300ms, only one API request should be triggered after the final input stabilizes for 300ms.

**Validates: Requirements 4.6**

### Property 13: Lead Deduplication by Name and City

For any two scraped leads with identical business name and city values, only the first lead should be stored in the database, and the duplicate should be rejected.

**Validates: Requirements 11.7**

### Property 14: Email Address Validation Pattern

For any extracted or user-provided email address, it should match a valid email regex pattern before being stored or used for outreach.

**Validates: Requirements 11.6**

### Property 15: Lead Contact Requirement Filtering

For any scraping operation with a specified contact requirement (email_required, phone_required, email_or_phone), only leads meeting that requirement should be saved to the database.

**Validates: Requirements 11.15**

### Property 16: AI Template Variable Substitution

For any email template containing variable placeholders ({{lead.name}}, {{lead.city}}, {{sender.name}}), all variables should be replaced with corresponding lead and sender data before the email is sent.

**Validates: Requirements 12.2, 12.3**

### Property 17: Email Message Categorization

For any incoming email message containing specific keywords (interested, meeting, not interested), the message should be categorized appropriately (interested, meeting_request, not_interested, etc.).

**Validates: Requirements 13.3**

### Property 18: Pipeline Status Update Persistence

For any lead card dragged to a new pipeline stage column, the lead's status field in the database should be updated to match the target stage.

**Validates: Requirements 14.4**

### Property 19: Scheduler Task Execution Prevention During Active Run

For any scheduled cron job, if the previous execution is still in progress, the next scheduled execution should be skipped to prevent concurrent processing conflicts.

**Validates: Requirements 15.11**

### Property 20: Settings Validation and Persistence

For any settings form submission with valid inputs, the configuration changes should be persisted to the campaign_settings table with user_id isolation and a success notification should be displayed.

**Validates: Requirements 16.2, 16.24, 16.26**

## Testing Strategy

### Unit Testing

- **Coverage Target**: Minimum 80% for backend services, 70% for frontend components
- **Framework**: Jest with React Testing Library for frontend, Jest for backend
- **Focus Areas**:
  - Authentication logic (password hashing, token generation/validation)
  - Data transformation functions (lead enrichment, email generation)
  - Utility functions (encryption, validation, formatting)
  - React component rendering and user interactions

### Integration Testing

- **Framework**: Supertest for API testing, Playwright for E2E
- **Focus Areas**:
  - API endpoint request/response contracts
  - Database operations with test database
  - External API integrations (mocked Gemini, Gmail)
  - OAuth flows with mocked provider

### Property-Based Testing

- **Framework**: fast-check for JavaScript/TypeScript
- **Focus Areas**:
  - Email validation across random email formats
  - Template variable substitution with random data
  - Lead deduplication with random name/city combinations
  - Token expiration with random time offsets
  - Multi-tenant isolation with random user IDs

### End-to-End Testing

- **Framework**: Playwright
- **Critical User Flows**:
  - Complete signup → lead discovery → campaign creation → email sending flow
  - Inbox sync → message categorization → AI reply generation flow
  - Pipeline drag-and-drop → status update → analytics reflection flow

### Performance Testing

- **Tools**: Lighthouse, WebPageTest, Apache JMeter
- **Metrics**:
  - Page load time < 2 seconds
  - First Contentful Paint < 1.2 seconds
  - Time to Interactive < 3 seconds
  - API response time < 200ms (p95)
  - Database query time < 50ms (p95)

### Security Testing

- **Tools**: OWASP ZAP, npm audit, Snyk
- **Focus Areas**:
  - SQL injection prevention
  - XSS vulnerability scanning
  - CSRF protection validation
  - Dependency vulnerability scanning
  - Authentication bypass attempts

## Monitoring & Observability

### Logging Strategy

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Usage
logger.info('Lead discovery started', { userId, niche, location });
logger.error('Gmail authentication failed', { userId, error: err.message });
```

### Metrics Collection

```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();

// Define metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const leadsDiscovered = new promClient.Counter({
  name: 'leads_discovered_total',
  help: 'Total number of leads discovered',
  labelNames: ['user_id', 'niche'],
  registers: [register]
});

const emailsSent = new promClient.Counter({
  name: 'emails_sent_total',
  help: 'Total number of outreach emails sent',
  labelNames: ['user_id', 'campaign_id'],
  registers: [register]
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Health Checks

```typescript
app.get('/health', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    status: 'healthy',
    timestamp: Date.now(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      gmail: await checkGmailConnection(),
      gemini: await checkGeminiAPI()
    }
  };

  const isHealthy = Object.values(health.checks).every(check => check.status === 'up');
  res.status(isHealthy ? 200 : 503).json(health);
});

async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    return { status: 'up' };
  } catch (error) {
    return { status: 'down', error: error.message };
  }
}
```

## Security Best Practices Implementation

### 1. Input Sanitization

```typescript
import { z } from 'zod';

const leadSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  city: z.string().min(1).max(100)
});

export function validateLead(data: unknown) {
  return leadSchema.parse(data);
}
```

### 2. SQL Injection Prevention

```typescript
// Always use parameterized queries
const result = await pool.query(
  'SELECT * FROM leads WHERE user_id = $1 AND city = $2',
  [userId, city]
);

// Never concatenate user input into SQL strings
// BAD: const query = `SELECT * FROM leads WHERE city = '${userInput}'`;
```

### 3. CORS Configuration

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 4. Security Headers

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.API_URL]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

## Documentation Structure

### README.md Structure

```markdown
# Syntek Autopilot

B2B outreach automation platform for freelancers, agencies, and enterprises.

## Features
- Automated lead discovery from Google Maps & Yelp
- AI-powered personalized email generation
- Smart inbox management with categorization
- Kanban pipeline for deal tracking
- Analytics dashboard with performance metrics
- Autonomous autopilot scheduler

## Tech Stack
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + PostgreSQL
- AI: Google Gemini API
- Infrastructure: Docker + Nginx + Redis

## Quick Start
[Installation instructions]

## Documentation
- [Architecture](./docs/ARCHITECTURE.md)
- [API Reference](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Contributing](./CONTRIBUTING.md)

## License
MIT
```

### API Documentation (OpenAPI/Swagger)

```yaml
openapi: 3.0.0
info:
  title: Syntek Autopilot API
  version: 1.0.0
  description: B2B outreach automation platform API

paths:
  /api/auth/login:
    post:
      summary: Authenticate user
      tags: [Authentication]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  format: password
      responses:
        200:
          description: Successful authentication
          content:
            application/json:
              schema:
                type: object
                properties:
                  accessToken:
                    type: string
                  refreshToken:
                    type: string
                  user:
                    $ref: '#/components/schemas/User'
        400:
          description: Invalid credentials
        429:
          description: Too many attempts

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
        email:
          type: string
        companyName:
          type: string
        role:
          type: string
          enum: [Freelancer, Agency_Admin, Enterprise_Admin]
```

## Migration Strategy

### Phase 1: Foundation (Weeks 1-2)
- Set up project structure and build tools
- Implement design system and core UI components
- Create database schema and migrations
- Set up Docker and development environment

### Phase 2: Authentication & Security (Weeks 3-4)
- Implement JWT authentication system
- Add password hashing and encryption
- Set up role-based access control
- Implement rate limiting and security headers

### Phase 3: Core Features (Weeks 5-8)
- Build lead discovery and scraping system
- Implement AI campaign generation
- Create inbox management and synchronization
- Build pipeline and analytics dashboard

### Phase 4: Advanced Features (Weeks 9-10)
- Implement autopilot scheduler
- Add Google OAuth integration
- Build calendar meeting booking
- Implement export/import functionality

### Phase 5: Testing & Optimization (Weeks 11-12)
- Write comprehensive test suite
- Perform performance optimization
- Conduct security audit
- Load testing and bottleneck identification

### Phase 6: Deployment & Documentation (Weeks 13-14)
- Set up CI/CD pipeline
- Create production deployment
- Write complete documentation
- User onboarding and training materials

## Conclusion

This design document provides a comprehensive blueprint for transforming Syntek Autopilot from MVP to production-ready enterprise platform. The architecture emphasizes scalability, security, maintainability, and user experience while maintaining clear separation of concerns and testability.

All components are designed with production-grade patterns including error handling, logging, monitoring, caching, and performance optimization. The multi-tenant architecture ensures complete data isolation while the modular service design enables independent scaling and future extensibility.

The implementation follows industry best practices for authentication, encryption, API design, database modeling, and DevOps, positioning Syntek Autopilot as a competitive B2B SaaS platform ready for commercial deployment.
```

Perfect! The comprehensive design document is now complete. Let me use the subagent_response tool to communicate back to the parent agent:

<function_calls>
<invoke name="subagent_response">
<parameter name="response">Design generation phase complete. Created comprehensive technical design document for Syntek Autopilot production transformation covering:

✅ High-level system architecture with layered service-oriented design
✅ Complete technology stack (React, Node.js, PostgreSQL, Redis, Docker)
✅ Design system with tokens, themes, and glassmorphism components
✅ Enterprise authentication with JWT, bcrypt, OAuth, and RBAC
✅ Comprehensive error handling architecture
✅ Enhanced database schema with multi-tenancy
✅ Lead discovery & enrichment system with DeepSearch
✅ AI campaign generation with Gemini integration
✅ Smart inbox management with IMAP sync
✅ Autopilot scheduler with cron jobs
✅ Analytics & reporting dashboard
✅ Security implementation (encryption, rate limiting, CORS, CSP)
✅ Complete API endpoint specification
✅ Docker deployment architecture with CI/CD pipeline
✅ Performance optimization patterns (code splitting, virtual scrolling, caching)
✅ Monitoring & observability (logging, metrics, health checks)
✅ 20 Correctness Properties with requirements traceability
✅ Comprehensive testing strategy
✅ Documentation structure and migration plan

The design document is production-ready and follows modern software architecture principles including separation of concerns, dependency injection, event-driven patterns, and microservices-ready modular structure. All 16 requirement areas from the requirements document are addressed with detailed technical specifications.