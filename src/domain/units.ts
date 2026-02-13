import { metersToYards, yardsToMeters } from './distance';

export const toDisplayDistance = (meters: number, unit: 'meters' | 'yards') =>
  unit === 'meters' ? Math.round(meters) : Math.round(metersToYards(meters));

export const convertDistance = (value: number, from: 'meters' | 'yards', to: 'meters' | 'yards') => {
  if (from === to) return value;
  return to === 'meters' ? yardsToMeters(value) : metersToYards(value);
};
