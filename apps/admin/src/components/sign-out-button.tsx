'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';

/**
 * Shared sign-out affordance: used by the sidebar (normal admin session) and by the
 * refusal/error screens (not-authorized, and the disabled-account case in SignInCard) so a
 * rejected user always has a way out instead of being stuck looking at an error message.
 */
export function SignOutButton({
  className,
  variant = 'outline',
  size = 'sm',
}: {
  className?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  const { signOutUser } = useAuth();
  const router = useRouter();

  const handleClick = async () => {
    await signOutUser();
    router.replace('/');
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={() => void handleClick()}>
      Đăng xuất
    </Button>
  );
}
