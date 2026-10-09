import { useState } from 'react';
import { errorMessage } from '@/api/errors';
import type { AdviceInput, Project } from '@/api/types';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useStartAdvice } from '../api';

const CURRENCIES: NonNullable<AdviceInput['currency']>[] = ['USD', 'EUR', 'GBP', 'INR'];

/** Five plain questions about the product; everything past the first two is optional. */
export function AdviceForm({ project }: { project: Project }) {
  const start = useStartAdvice(project.id);
  const [product, setProduct] = useState('');
  const [pitch, setPitch] = useState('');
  const [audience, setAudience] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [priceIdea, setPriceIdea] = useState('');
  const [billing, setBilling] = useState<NonNullable<AdviceInput['billing']>>('subscription');
  const [currency, setCurrency] = useState<NonNullable<AdviceInput['currency']>>('USD');
  const [buyers, setBuyers] = useState(12);

  const submit = () => {
    const input: AdviceInput = {
      product: product.trim(),
      pitch: pitch.trim(),
      audience: audience.trim() || null,
      price_idea: priceIdea.trim() || null,
      competitors: competitors.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 8),
      billing,
      currency,
      buyers,
    };
    start.mutate(input, { onSuccess: (a) => navigate({ name: 'advice', id: project.id, aid: a.id }) });
  };

  return (
    <form
      className="rounded-3xl border bg-card p-6 md:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="text-xl">Tell the crew about your product</h2>
      <p className="mt-1 mb-6 text-sm text-body">Answer in your own words. The crew researches the rest and tells you what to do.</p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="product">What is it called?</FieldLabel>
          <Input id="product" required maxLength={80} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Flockcast" />
        </Field>
        <Field>
          <FieldLabel htmlFor="pitch">What does it do, and why would someone want it?</FieldLabel>
          <Textarea id="pitch" required minLength={20} maxLength={2000} rows={4} value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="Rehearse a social post with a simulated audience before you publish it, so you can fix the line people would argue with." />
        </Field>
        <Field>
          <FieldLabel htmlFor="audience">Who is it for?</FieldLabel>
          <Input id="audience" maxLength={500} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Optional. Leave empty and the crew will work it out." />
        </Field>
        <Field>
          <FieldLabel htmlFor="competitors">Anything similar you know of?</FieldLabel>
          <Input id="competitors" maxLength={500} value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="Optional. Separate names with commas." />
        </Field>
        <Collapsible>
          <CollapsibleTrigger className="rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline">Price and crowd size</CollapsibleTrigger>
          <CollapsibleContent className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="billing">How people pay</FieldLabel>
              <Select value={billing} onValueChange={(v) => setBilling(v as typeof billing)}>
                <SelectTrigger id="billing" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription">Every month</SelectItem>
                  <SelectItem value="one_time">Once</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Select value={currency} onValueChange={(v) => setCurrency(v as typeof currency)}>
                <SelectTrigger id="currency" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="price-idea">The price you had in mind</FieldLabel>
              <Input id="price-idea" maxLength={120} value={priceIdea} onChange={(e) => setPriceIdea(e.target.value)} placeholder="Optional, like “about $10 a month”" />
            </Field>
            <Field>
              <FieldLabel htmlFor="buyers">Buyers to ask</FieldLabel>
              <Input id="buyers" type="number" min={5} max={30} value={buyers} onChange={(e) => setBuyers(Number(e.target.value))} />
              <FieldDescription>More buyers give a steadier price range.</FieldDescription>
            </Field>
          </CollapsibleContent>
        </Collapsible>
        {start.error && <FieldError>{errorMessage(start.error)}</FieldError>}
        <div className="pt-1">
          <Button type="submit" size="lg" disabled={start.isPending || !product.trim() || pitch.trim().length < 20}>
            {start.isPending && <Spinner />}
            Get launch advice
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
