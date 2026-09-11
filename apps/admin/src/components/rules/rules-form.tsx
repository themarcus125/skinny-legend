'use client';

import { useState } from 'react';
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { CATEGORY_LABELS } from '@/lib/labels';
import { rulesFormSchema, toFormValues, toRulesPayload, type RulesFormValues } from './rules-schema';

const CAP_PERIOD_LABELS = { day: 'mỗi ngày', week: 'mỗi tuần' } as const;

/** Every numeric path in RulesFormValues. */
type NumberFieldName =
  | 'streakPoints'
  | 'streakLength'
  | `rules.${number}.points`
  | `rules.${number}.capCount`;

/**
 * The one place a number input is wired to react-hook-form. `valueAsNumber` yields NaN for an
 * empty box; the input renders '' so it stays controlled and clearable, and the schema's
 * 'Phải là số' message fires on submit.
 */
function NumberField({
  control,
  name,
  label,
}: {
  control: Control<RulesFormValues>;
  name: NumberFieldName;
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
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
  const form = useForm<RulesFormValues>({
    resolver: zodResolver(rulesFormSchema),
    defaultValues: toFormValues(data),
    mode: 'onSubmit',
  });
  const rules = useFieldArray({ control: form.control, name: 'rules' });
  const [pending, setPending] = useState<RulesFormValues | null>(null);

  const watchedRules = useWatch({ control: form.control, name: 'rules' });
  const used = watchedRules.map((rule) => rule.category);
  const unused = CATEGORIES.filter((category) => !used.includes(category));

  return (
    <>
      <Form {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit((values) => setPending(values))}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mốc thời gian</CardTitle>
              <CardDescription>
                Múi giờ cố định phía máy chủ: {data.challenge.timezone} (không sửa được qua API).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ngày bắt đầu</FormLabel>
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
                    <FormLabel>Ngày kết thúc</FormLabel>
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
            <CardHeader>
              <CardTitle className="text-base">Chuỗi ngày</CardTitle>
              <CardDescription>Thưởng mỗi khi chuỗi đạt bội số của độ dài chuỗi.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <NumberField control={form.control} name="streakPoints" label="Điểm thưởng" />
              <NumberField control={form.control} name="streakLength" label="Độ dài chuỗi (ngày)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hạng mục</CardTitle>
              <CardDescription>Điểm và giới hạn cho mỗi hạng mục. Mỗi hạng mục chỉ xuất hiện một lần.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rules.fields.map((row, index) => (
                <div key={row.id} className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_6rem_8rem_auto]">
                  <FormField
                    control={form.control}
                    name={`rules.${index}.category`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hạng mục</FormLabel>
                        <Select items={CATEGORY_LABELS} value={field.value} onValueChange={(value) => field.onChange(value as Category)}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>
                                {CATEGORY_LABELS[category]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <NumberField control={form.control} name={`rules.${index}.points`} label="Điểm" />
                  <NumberField control={form.control} name={`rules.${index}.capCount`} label="Giới hạn" />
                  <FormField
                    control={form.control}
                    name={`rules.${index}.capPeriod`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chu kỳ</FormLabel>
                        <Select items={CAP_PERIOD_LABELS} value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="day">{CAP_PERIOD_LABELS.day}</SelectItem>
                            <SelectItem value="week">{CAP_PERIOD_LABELS.week}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={rules.fields.length === 1}
                    onClick={() => rules.remove(index)}
                  >
                    Xoá
                  </Button>
                </div>
              ))}

              {form.formState.errors.rules?.root ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.rules.root.message}
                </p>
              ) : null}

              <Button
                type="button"
                variant="outline"
                disabled={unused.length === 0}
                onClick={() => rules.append({ category: unused[0]!, points: 0, capCount: 1, capPeriod: 'day' })}
              >
                Thêm hạng mục
              </Button>
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSaving}>
            Lưu luật chơi
          </Button>
        </form>
      </Form>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Áp dụng luật mới?</DialogTitle>
            <DialogDescription>
              Điểm không được lưu trong cơ sở dữ liệu — mọi bảng xếp hạng, chuỗi ngày và thống kê được tính
              lại từ luật hiện hành. Thay đổi này áp dụng <strong>hồi tố</strong> cho toàn bộ mục ghi đã có.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Huỷ
            </Button>
            <Button
              disabled={isSaving}
              onClick={() => {
                if (pending) onSave(toRulesPayload(pending));
                setPending(null);
              }}
            >
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
