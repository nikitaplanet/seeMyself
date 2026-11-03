import { Paper } from '@mantine/core';
import { MantineRoot } from '@/components/MantineRoot';

/** Shared frame for the small auth pages (login, reset password, auth error). */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
            <h1 className="font-serif text-3xl font-medium tracking-wide">{title}</h1>
            <MantineRoot>
                <Paper withBorder radius="md" shadow="none" className="p-5 sm:p-8">
                    {children}
                </Paper>
            </MantineRoot>
        </div>
    );
}

/** Suspense fallback with the card's footprint. */
export function AuthCardSkeleton() {
    return <div aria-hidden="true" className="hd-skeleton h-72 rounded-lg bg-surface-2" />;
}
