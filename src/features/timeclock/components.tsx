import { useMemo } from 'react';
import { currentPayPeriod, fmtRange, payPeriodAt } from '../../domain/audits/model.ts';
import { Icon } from '../../components/icons/Icon.tsx';
import { useClock } from '../../app/store/stores.ts';
import { SETUP_MESSAGE, periodsWithData } from './clock-data.ts';
import type { PayPeriod } from '../../types/audit.ts';

export function usePeriodChoice() {
  const imports = useClock((s) => s.imports);
  const chosen = useClock((s) => s.period);
  return useMemo(() => {
    const periods = periodsWithData(imports);
    const period = chosen !== null ? payPeriodAt(chosen) : periods[0] || currentPayPeriod();
    const options = periods.some((p) => p.index === period.index) ? periods : [period, ...periods].sort((a, b) => b.index - a.index);
    return { period, options };
  }, [imports, chosen]);
}

export function PeriodSelect({ period, options }: { period: PayPeriod; options: PayPeriod[] }) {
  return (
    <label className="SortMenu">
      <span className="SortMenu-label"><Icon name="calendar" size={14} />Pay period</span>
      <select className="form-select select-sm" aria-label="Pay period" value={period.index} onChange={(ev) => useClock.setState({ period: Number(ev.target.value), open: null })}>
        {options.map((p) => <option key={p.index} value={p.index}>#{p.number} · {fmtRange(p.start, p.end)}</option>)}
      </select>
    </label>
  );
}

export function ClockNotice({ error }: { error: string }) {
  if (!error) return null;
  return <div className="flash flash-warn" role="status"><Icon name="alert" /><span>{error === 'missing-table' ? SETUP_MESSAGE : `Couldn’t load clock-in data: ${error}`}</span></div>;
}
