import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard, AuthCardSkeleton } from '@/components/auth/AuthCard';
import { LoginView } from '@/components/auth/LoginView';

export const metadata: Metadata = {
  title: '登入／註冊',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthCard title="會員登入">
      {/* LoginView reads ?next= / ?mode= with useSearchParams, which needs a Suspense boundary. */}
      <Suspense fallback={<AuthCardSkeleton />}>
        <LoginView />
      </Suspense>
    </AuthCard>
  );
}
