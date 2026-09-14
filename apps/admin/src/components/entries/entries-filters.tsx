'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ENTRY_STATUSES, type AdminUser } from '@/lib/api/types';
import { ENTRY_STATUS_LABELS } from '@/lib/labels';
import { ALL, EMPTY_FILTER_FORM, type FilterForm } from './filters';

/** The 36px rail is taller than the primitive's 32px, so pull the ink underline back onto its baseline. */
const TAB_TRIGGER_CLASS = 'px-0 text-sm font-semibold group-data-horizontal/tabs:after:-bottom-px';

export function EntriesFilters({
  value,
  onChange,
  members,
}: {
  value: FilterForm;
  onChange: (next: FilterForm) => void;
  members: AdminUser[];
}) {
  const t = useTranslations();
  const memberItems: Record<string, string> = { [ALL]: t('common.all') };
  for (const member of members) memberItems[member.id] = member.displayName;

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
      <Tabs value={value.status} onValueChange={(status) => onChange({ ...value, status })}>
        <TabsList variant="line" className="gap-5 p-0 group-data-horizontal/tabs:h-9">
          <TabsTrigger value={ALL} className={TAB_TRIGGER_CLASS}>
            {t('common.all')}
          </TabsTrigger>
          {ENTRY_STATUSES.map((status) => (
            <TabsTrigger key={status} value={status} className={TAB_TRIGGER_CLASS}>
              {t(ENTRY_STATUS_LABELS[status])}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* One flex unit so the fields wrap together (never a stray reset button) below ~1100px. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-user">
            {t('common.member')}
          </Label>
          <Select
            items={memberItems}
            value={value.user}
            onValueChange={(user) => onChange({ ...value, user: user ?? ALL })}
          >
            <SelectTrigger id="filter-user" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.all')}</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-from">
            {t('entries.from')}
          </Label>
          <Input
            id="filter-from"
            type="date"
            className="w-40"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-to">
            {t('entries.to')}
          </Label>
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
          className="text-secondary-foreground"
          onClick={() => onChange(EMPTY_FILTER_FORM)}
        >
          {t('entries.clearFilters')}
        </Button>
      </div>
    </div>
  );
}
