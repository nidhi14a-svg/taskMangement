'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  KeyRound,
  Mail,
  User,
} from 'lucide-react';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Spinner } from '@/components/common/Spinner';
import { employeeService } from '@/api/services/employeeService';
import { AccountActivateVerifyResponse } from '@/types';
import { extractErrorMessage } from '@/utils/formatters';

function ActivationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get('token') || '';

  const [tokenInput, setTokenInput] = useState(tokenParam);
  const [activeToken, setActiveToken] = useState(tokenParam);

  const [isVerifying, setIsVerifying] = useState(Boolean(tokenParam));
  const [tokenData, setTokenData] = useState<AccountActivateVerifyResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isActivated, setIsActivated] = useState(false);

  // Verify token when activeToken changes
  useEffect(() => {
    if (!activeToken) {
      setIsVerifying(false);
      return;
    }

    let isMounted = true;
    setIsVerifying(true);
    setVerifyError(null);

    employeeService
      .verifyActivationToken(activeToken)
      .then((data) => {
        if (!isMounted) return;
        setTokenData(data);
        if (!data.valid) {
          setVerifyError(
            data.message || 'This activation link is invalid, expired, or has already been used.'
          );
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg = extractErrorMessage(
          err?.response?.data?.detail,
          'Failed to verify activation token. Please ensure your token is valid.'
        );
        setVerifyError(msg);
      })
      .finally(() => {
        if (isMounted) setIsVerifying(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeToken]);

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      setActiveToken(tokenInput.trim());
    }
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      await employeeService.activateAccount(activeToken, password);
      setIsActivated(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (err: any) {
      const msg = extractErrorMessage(
        err?.response?.data?.detail,
        err instanceof Error ? err.message : 'Failed to activate account. The link may have expired.'
      );
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isActivated) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-sm animate-bounce">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Account Activated!</h2>
          <p className="text-xs text-slate-500">
            Welcome to TaskFlow, <span className="font-semibold text-slate-700">{tokenData?.name}</span>. Redirecting you to your workspace...
          </p>
        </div>
        <div className="pt-2">
          <Spinner size="md" className="mx-auto text-indigo-600" />
        </div>
      </div>
    );
  }

  // Token not provided yet -> show manual token entry form
  if (!activeToken) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Activate Your Account</h2>
          <p className="text-xs text-slate-500">
            Enter the activation token you received in your invitation email
          </p>
        </div>

        <form onSubmit={handleManualTokenSubmit} className="space-y-4">
          <Input
            label="Activation Token"
            placeholder="e.g. 32-character secure activation token"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            required
            autoFocus
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full flex items-center justify-center gap-2 font-semibold"
            disabled={!tokenInput.trim()}
          >
            <span>Verify Token</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Already activated?{' '}
          <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  // Verifying token
  if (isVerifying) {
    return (
      <div className="py-12 text-center space-y-3">
        <Spinner size="lg" className="mx-auto text-indigo-600" />
        <p className="text-xs text-slate-500">Validating your activation credentials...</p>
      </div>
    );
  }

  // Token is invalid or expired
  if (verifyError || !tokenData?.valid) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 shadow-sm">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">Invalid or Expired Link</h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            {verifyError || 'This activation link is no longer valid. It may have expired or already been consumed.'}
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveToken('');
              setVerifyError(null);
            }}
          >
            Try Another Token
          </Button>
          <Link href="/login">
            <Button variant="primary" size="sm" className="w-full">
              Proceed to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Token is valid -> Prompt employee to set secure password
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Set Account Password</h2>
        <p className="text-xs text-slate-500">
          Establish your credentials to activate your TaskFlow workspace
        </p>
      </div>

      {/* Recipient Details Card */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <User className="w-3.5 h-3.5 text-slate-400" />
          <span>{tokenData.name}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <Mail className="w-3.5 h-3.5 text-slate-400" />
          <span>{tokenData.email}</span>
        </div>
      </div>

      {formError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleActivateSubmit} className="space-y-4">
        <div>
          <Input
            label="New Password"
            type="password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Choose a strong password with at least 8 characters.
          </p>
        </div>

        <div>
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          isLoading={isSubmitting}
          className="w-full flex items-center justify-center gap-2 font-semibold shadow-sm"
        >
          <Lock className="w-4 h-4" />
          <span>Activate Account & Sign In</span>
        </Button>
      </form>

      <p className="text-center text-xs text-slate-500">
        Already have an active account?{' '}
        <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center space-y-3">
          <Spinner size="lg" className="mx-auto text-indigo-600" />
          <p className="text-xs text-slate-500">Loading activation interface...</p>
        </div>
      }
    >
      <ActivationForm />
    </Suspense>
  );
}
