'use client';

import { Button, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authReasonMessage } from '@/lib/auth/errors';

export function AuthErrorView() {
  const reason = useSearchParams().get('reason');
  return (
    <Stack gap="md">
      <Text role="alert">{authReasonMessage(reason)}</Text>
      <Group gap="sm">
        <Button component={Link} href="/login">
          回到登入
        </Button>
        <Button component={Link} href="/login?mode=forgot" variant="default">
          重設密碼
        </Button>
      </Group>
    </Stack>
  );
}
