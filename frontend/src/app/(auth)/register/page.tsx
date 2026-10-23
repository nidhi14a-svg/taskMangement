'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  User as UserIcon,
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
} from 'lucide-react';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useAuth } from '@/hooks/useAuth';

// Zod validation schema matching backend Pydantic constraints
const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Full name is required')
      .max(255, 'Full name cannot exceed 255 characters'),
    email: z
      .string()
      .trim()
      .min(1, 'Email address is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password cannot exceed 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // If already authenticated, redirect directly to dashboard
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const watchedPassword = watch('password', '');
  const watchedConfirmPassword = watch('confirmPassword', '');

  // Dynamic password criteria checks for enhanced user feedback
  const hasMinLength = watchedPassword.length >= 8;
  const passwordsMatch =
    watchedPassword.length > 0 &&
    watchedConfirmPassword.length > 0 &&
    watchedPassword === watchedConfirmPassword;

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);

    try {
      // Public registration strictly excludes any role parameter
      await registerUser({
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        password: data.password,
      });

      // On successful registration, redirect to login page with success notification
      router.push('/login?registered=true');
    } catch (err: any) {
      if (err?.response?.status === 409) {
        // Backend DuplicateKeyError on email
        const message =
          err?.response?.data?.detail ||
          'A user with this email address already exists.';
        setError('email', { type: 'manual', message });
        setServerError(message);
      } else if (err?.code === 'ERR_NETWORK' || !err?.response) {
        setServerError(
          'Unable to reach the backend server. Please verify that the API is running at http://127.0.0.1:8000.'
        );
      } else {
        setServerError(
          err?.response?.data?.detail ||
            'Registration failed. Please verify your details or use a different email.'
        );
      }
    }
  };

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Create your account</h2>
        <p className="text-xs text-slate-500 mt-1">
          Join TaskFlow to organize projects and collaborate with your team
        </p>
      </div>

      {/* Server Error Alert Banner */}
      {serverError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5 font-medium leading-relaxed"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{serverError}</span>
            {serverError.includes('already exists') && (
              <div className="mt-1">
                <Link
                  href="/login"
                  className="font-semibold text-red-800 underline hover:text-red-900"
                >
                  Sign in instead &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Full Name */}
        <Input
          id="name-input"
          label="Full Name"
          type="text"
          required
          autoComplete="name"
          placeholder="Jane Developer"
          {...register('name')}
          error={errors.name?.message}
          leftIcon={<UserIcon className="w-4 h-4" />}
          disabled={isSubmitting}
          autoFocus
        />

        {/* Email Address */}
        <Input
          id="email-input"
          label="Email Address"
          type="email"
          required
          autoComplete="email"
          placeholder="jane@example.com"
          {...register('email')}
          error={errors.email?.message}
          leftIcon={<Mail className="w-4 h-4" />}
          disabled={isSubmitting}
        />

        {/* Password */}
        <Input
          id="password-input"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
          placeholder="Minimum 8 characters"
          {...register('password')}
          error={errors.password?.message}
          leftIcon={<Lock className="w-4 h-4" />}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
          disabled={isSubmitting}
        />

        {/* Confirm Password */}
        <Input
          id="confirm-password-input"
          label="Confirm Password"
          type={showConfirmPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
          placeholder="Re-enter your password"
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
          leftIcon={<Lock className="w-4 h-4" />}
          rightElement={
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
          disabled={isSubmitting}
        />

        {/* Password Requirements Guidance */}
        <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 space-y-1.5 text-[11px]">
          <p className="font-semibold text-slate-600">Password requirements:</p>
          <div className="flex items-center gap-2 text-slate-500">
            <span
              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                hasMinLength
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {hasMinLength ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '•'}
            </span>
            <span className={hasMinLength ? 'text-emerald-700 font-medium' : ''}>
              At least 8 characters long
            </span>
          </div>
          {watchedConfirmPassword.length > 0 && (
            <div className="flex items-center gap-2 text-slate-500">
              <span
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                  passwordsMatch
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-400'
                }`}
              >
                {passwordsMatch ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : '•'}
              </span>
              <span className={passwordsMatch ? 'text-emerald-700 font-medium' : ''}>
                Passwords match
              </span>
            </div>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="w-full mt-2 font-semibold flex items-center justify-center gap-2"
          isLoading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating Account...' : 'Create Account'}
          {!isSubmitting && <ArrowRight className="w-4 h-4" />}
        </Button>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
