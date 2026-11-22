import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSecurityJob } from './securityJob';
import { RESOURCE_LIMITS } from './resourceLimits';

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: {data: unknown}) => void) | null = null;
  onerror: ((event: {preventDefault: () => void}) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { MockWorker.instances.push(this); }
}
beforeEach(() => { MockWorker.instances=[];vi.stubGlobal('Worker',MockWorker);vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers();vi.unstubAllGlobals(); });
describe('security worker lifecycle', () => {
  it('terminates on timeout and rejects the operation', async () => {
    const job=runSecurityJob(new Uint8Array([1]),'protect','test-password',new AbortController().signal);
    const rejected=expect(job).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(RESOURCE_LIMITS.processingTimeoutMs);await rejected;
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it('terminates on cancellation and cannot resolve with a late output', async () => {
    const controller=new AbortController();
    const job=runSecurityJob(new Uint8Array([1]),'protect','test-password',controller.signal);
    const rejected=expect(job).rejects.toThrow('cancelled');controller.abort();
    MockWorker.instances[0].onmessage?.({data:{bytes:new Uint8Array([2])}});
    await rejected;expect(MockWorker.instances[0].terminate).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('terminates after success, native error, and malformed response', async () => {
    for(const result of ['success','native','malformed']) {
      const job=runSecurityJob(new Uint8Array([1]),'unlock','password',new AbortController().signal);
      const worker=MockWorker.instances.at(-1)!;
      if(result==='success'){worker.onmessage?.({data:{bytes:new Uint8Array([3])}});expect(await job).toEqual(new Uint8Array([3]));}
      else if(result==='native'){worker.onerror?.({preventDefault:vi.fn()});await expect(job).rejects.toThrow('could not run');}
      else {worker.onmessage?.({data:{}});await expect(job).rejects.toThrow('could not complete');}
      expect(worker.terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
    }
  });
  it('does not start an already cancelled job and wipes untransferred bytes', async () => {
    const controller=new AbortController();controller.abort();const bytes=new Uint8Array([9]);
    await expect(runSecurityJob(bytes,'protect','password',controller.signal)).rejects.toThrow('cancelled');
    expect(bytes[0]).toBe(0);expect(MockWorker.instances).toHaveLength(0);
  });
});
