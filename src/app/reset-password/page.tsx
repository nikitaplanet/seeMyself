import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/AuthCard';
import { ResetPasswordView } from '@/components/auth/ResetPasswordView';

export const metadata: Metadata = {
  title: '設定新密碼',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthCard title="設定新密碼">
      <ResetPasswordView />
    </AuthCard>
  );
}
