import React from 'react';
import Link from 'next/link';
import { CheckSquare } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Brand Logo & Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-600/20">
            <CheckSquare className="w-5 h-5 stroke-[2.25]" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">TaskFlow</span>
        </Link>
      </div>

      {/* Main Form Surface Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/90 rounded-2xl sm:px-10">
          {children}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Secure JWT Authentication &middot; Argon2id Password Encryption
        </p>
      </div>
    </div>
  );
}
