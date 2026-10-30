import { afterEach, describe, expect, it, vi } from 'vitest';
import { revokeObjectUrls } from './objectUrl';

describe('revokeObjectUrls', () => {
  afterEach(() => vi.restoreAllMocks());

  it('revokes every unique generated URL', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeObjectUrls(['blob:first', 'blob:second', 'blob:first']);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith('blob:first');
    expect(revoke).toHaveBeenCalledWith('blob:second');
  });

  it('handles an empty URL list', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeObjectUrls([]);
    expect(revoke).not.toHaveBeenCalled();
  });
});
