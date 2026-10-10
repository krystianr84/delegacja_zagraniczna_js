import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round, roundUp } from '../web/lib/round.js';

test('round: przypadki, w których Math.round(x*100)/100 się myli', () => {
  assert.equal(Math.round(1.005 * 100) / 100, 1);   // dla porównania – tak NIE liczy Excel
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(round(2.675, 2), 2.68);
  assert.equal(round(0.285, 2), 0.29);
  assert.equal(round(1.255, 2), 1.26);
  assert.equal(round(8.345, 2), 8.35);
  assert.equal(round(1234.565, 2), 1234.57);
});

test('round: połówki od zera, także dla liczb ujemnych', () => {
  assert.equal(round(0.5), 1);
  assert.equal(round(1.5), 2);
  assert.equal(round(2.5), 3);
  assert.equal(round(-0.5), -1);
  assert.equal(round(-2.5), -3);
  assert.equal(round(-1.005, 2), -1.01);
  assert.equal(round(0.49), 0);
  assert.ok(Object.is(round(-0.4), 0), 'bez -0');
});

test('round: wyniki działań z diety', () => {
  assert.equal(round(44 * (4 + 1 / 3), 2), 190.67);   // Węgry 4 dni 4 godz.
  assert.equal(round(190.67 * 4.3789, 2), 834.92);
  assert.equal(round(190.67 * 4.4, 2), 838.95);      // 838,948
  assert.equal(round(49 * (2 + 1 / 3) - 14.7, 2), 99.63);
  assert.equal(round(0.1 + 0.2, 2), 0.3);
  assert.equal(round(6000.000000001, 0), 6000);
});

test('round: inne n', () => {
  assert.equal(round(123.456), 123);
  assert.equal(round(123.456, 1), 123.5);
  assert.equal(round(1234.5, -1), 1230);
  assert.equal(round(1235, -1), 1240);
  assert.equal(round(4.37885, 4), 4.3789);
  assert.equal(round(0, 2), 0);
});

test('roundUp: od zera', () => {
  assert.equal(roundUp(2 + 1 / 3), 3);
  assert.equal(roundUp(2), 2);
  assert.equal(roundUp(2.5000000000000001), 3);
  assert.equal(roundUp(-1.2), -2);
  assert.equal(roundUp(1.001, 2), 1.01);
  assert.equal(roundUp(1.1 * 3, 1), 3.3);              // 3.3000000000000003 to w Excelu 3,3
});
