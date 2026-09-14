'use client';

import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, type Category, type RulesPayload, type RulesResponse } from '@/lib/api/types';
import { CATEGORY_LABELS, translateLabels } from '@/lib/labels';
import { rulesFormSchema, toFormValues, toRulesPayload, type RulesFormValues } from './rules-schema';

const RULE_ROW_CLASS = 'grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_9rem_auto]';

/**
 * The category card reads as a table: only the first row shows its four labels. Later rows keep
 * them in the DOM (htmlFor / getByLabelText) but visually hidden — at `sm` and up, where the grid
 * columns line up under the first row's labels; stacked on phones every row shows them again.
 */
function ruleLabelClass(index: number) {
  return index === 0 ? undefined : 'sm:sr-only';
}

/** Every numeric path in RulesFormValues. */
type NumberFieldName =
  | 'streakPoints'
  | 'streakLength'
  | `rules.${number}.points`
  | `rules.${number}.capCount`;

/**
 * The one place a number input is wired to react-hook-form. `valueAsNumber` yields NaN for an
 * empty box; the input renders '' so it stays controlled and clearable, and the schema's
 * `rules.errors.number` message fires on submit.
 */
function NumberField({
  control,
  name,
  label,
  labelClassName,
}: {
  control: Control<RulesFormValues>;
  name: NumberFieldName;
  label: string;
  labelClassName?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={labelClassName}>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              className="tabular-nums"
              value={Number.isNaN(field.value) ? '' : field.value}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
              onChange={(event) => field.onChange(event.target.valueAsNumber)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function RulesForm({
  data,
  onSave,
  isSaving,
}: {
  data: RulesResponse;
  onSave: (payload: RulesPayload) => void;
  isSaving: boolean;
}) {
  const t = useTranslations('rules');
  const tRoot = useTranslations();
  const schema = useMemo(() => rulesFormSchema(t), [t]);
  const form = useForm<RulesFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(data),
    mode: 'onSubmit',
  });
  const rules = useFieldArray({ control: form.control, name: 'rules' });
  const [pending, setPending] = useState<RulesFormValues | null>(null);

  const watchedRules = useWatch({ control: form.control, name: 'rules' });
  const used = watchedRules.map((rule) => rule.category);
  const unused = CATEGORIES.filter((category) => !used.includes(category));

  const categoryItems = translateLabels(CATEGORY_LABELS, tRoot);
  const capPeriodItems = { day: t('perDay'), week: t('perWeek') } as const;

  return (
    <>
      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit((values) => setPending(values))}>
          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t('timeline')}</CardTitle>
              <CardDescription>{t('timezoneNote', { timezone: data.challenge.timezone })}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('startDate')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('endDate')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>{t('streak')}</CardTitle>
              <CardDescription>{t('streakHint')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <NumberField control={form.control} name="streakPoints" label={t('streakPoints')} />
              <NumberField control={form.control} name="streakLength" label={t('streakLength')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>{tRoot('common.category')}</CardTitle>
              <CardDescription>{t('scoring')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rules.fields.map((row, index) => (
                <div key={row.id} className={RULE_ROW_CLASS}>
                  <FormField
                    control={form.control}
                    name={`rules.${index}.category`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={ruleLabelClass(index)}>{tRoot('common.category')}</FormLabel>
                        <Select items={categoryItems} value={field.value} onValueChange={(value) => field.onChange(value as Category)}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                {categoryItems[category]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <NumberField
                    control={form.control}
                    name={`rules.${index}.points`}
                    label={tRoot('common.points')}
                    labelClassName={ruleLabelClass(index)}
                  />
                  <NumberField
                    control={form.control}
                    name={`rules.${index}.capCount`}
                    label={t('limit')}
                    labelClassName={ruleLabelClass(index)}
                  />
                  <FormField
                    control={form.control}
                    name={`rules.${index}.capPeriod`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={ruleLabelClass(index)}>{t('period')}</FormLabel>
                        <Select items={capPeriodItems} value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="day">{capPeriodItems.day}</SelectItem>
                            <SelectItem value="week">{capPeriodItems.week}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-secondary-foreground hover:text-destructive"
                    disabled={rules.fields.length === 1}
                    onClick={() => rules.remove(index)}
                  >
                    {tRoot('common.delete')}
                  </Button>
                </div>
              ))}

              {form.formState.errors.rules?.root ? (
                <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive">
                  {form.formState.errors.rules.root.message}
                </p>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={unused.length === 0}
                onClick={() => rules.append({ category: unused[0]!, points: 0, capCount: 1, capPeriod: 'day' })}
              >
                {t('addCategory')}
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-4 rounded-xl border border-border bg-card px-5 py-3 shadow-card">
            <p className="mr-auto text-label text-muted-foreground">{t('recalcNote')}</p>
            <Button type="submit" disabled={isSaving}>
              {t('submit')}
            </Button>
          </div>
        </form>
      </Form>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('applyConfirm')}</DialogTitle>
            <DialogDescription>
              {t.rich('applyDescription', { strong: (chunks) => <strong>{chunks}</strong> })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              {tRoot('common.cancel')}
            </Button>
            <Button
              disabled={isSaving}
              onClick={() => {
                if (pending) onSave(toRulesPayload(pending));
                setPending(null);
              }}
            >
              {t('apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
