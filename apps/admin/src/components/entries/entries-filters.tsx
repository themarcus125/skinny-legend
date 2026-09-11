'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ENTRY_STATUSES, type AdminUser } from '@/lib/api/types';
import { ENTRY_STATUS_LABELS } from '@/lib/labels';
import { ALL, EMPTY_FILTER_FORM, type FilterForm } from './filters';

export function EntriesFilters({
  value,
  onChange,
  members,
}: {
  value: FilterForm;
  onChange: (next: FilterForm) => void;
  members: AdminUser[];
}) {
  const memberItems: Record<string, string> = { [ALL]: 'Tất cả' };
  for (const member of members) memberItems[member.id] = member.displayName;

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <Tabs value={value.status} onValueChange={(status) => onChange({ ...value, status })}>
        <TabsList variant="line" className="h-9 gap-5 p-0">
          <TabsTrigger value={ALL} className="px-0 text-sm font-medium">
            Tất cả
          </TabsTrigger>
          {ENTRY_STATUSES.map((status) => (
            <TabsTrigger key={status} value={status} className="px-0 text-sm font-medium">
              {ENTRY_STATUS_LABELS[status]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-secondary-foreground" htmlFor="filter-user">
          Thành viên
        </label>
        <Select
          items={memberItems}
          value={value.user}
          onValueChange={(user) => onChange({ ...value, user: user ?? ALL })}
        >
          <SelectTrigger id="filter-user" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-secondary-foreground" htmlFor="filter-from">
          Từ ngày
        </label>
        <Input
          id="filter-from"
          type="date"
          className="w-40"
          value={value.from}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-label font-medium text-secondary-foreground" htmlFor="filter-to">
          Đến ngày
        </label>
        <Input
          id="filter-to"
          type="date"
          className="w-40"
          value={value.to}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="ml-auto text-secondary-foreground"
        onClick={() => onChange(EMPTY_FILTER_FORM)}
      >
        Xoá bộ lọc
      </Button>
    </div>
  );
}
