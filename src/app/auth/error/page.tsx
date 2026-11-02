import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard, AuthCardSkeleton } from '@/components/auth/AuthCard';
import { AuthErrorView } from '@/components/auth/AuthErrorView';

export const metadata: Metadata = {
  title: '登入未完成',
  robots: { index: false, follow: false },
};

export default function AuthErrorPage() {
  return (
    <AuthCard title="登入未完成">
      <Suspense fallback={<AuthCardSkeleton />}>
        <AuthErrorView />
      </Suspense>
    </AuthCard>
  );
}
