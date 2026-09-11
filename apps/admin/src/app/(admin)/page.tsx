'use client';

import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/auth-context';

const SECTIONS = [
  { href: '/members', title: 'Thành viên', description: 'Duyệt người mới, đổi vai trò, khoá tài khoản.' },
  { href: '/entries', title: 'Mục ghi', description: 'Lọc, xem nhận định AI, sửa hạng mục, từ chối.' },
  { href: '/rules', title: 'Luật chơi', description: 'Điểm, giới hạn, chuỗi ngày và mốc thời gian.' },
  { href: '/feedback', title: 'Góp ý', description: 'Góp ý gửi từ ứng dụng iOS.' },
] as const;

export default function OverviewPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Xin chào {user?.displayName ?? ''}</h1>
        <p className="text-sm text-muted-foreground">Operation Skinny Legend — 08/09/2026 đến 25/12/2026.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:border-foreground/30">
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
