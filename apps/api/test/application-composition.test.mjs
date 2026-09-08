import assert from 'node:assert/strict';
import { test } from 'node:test';

test('el simulador de kiosco queda deshabilitado de forma predeterminada', async () => {
  delete process.env.ENABLE_KIOSK_MOCK;
  const { AppModule } = await import('../dist/app.module.js');
  const imports = Reflect.getMetadata('imports', AppModule) ?? [];

  assert.equal(
    imports.some((item) => item?.name === 'KioskMockModule'),
    false,
  );
});
