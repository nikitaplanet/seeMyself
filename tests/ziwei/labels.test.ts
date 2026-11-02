import { describe, expect, it } from 'vitest';
import {
  displayBrightness,
  displayPalaceName,
  fiveElementsLabel,
  nayinOf,
  palaceNamesFromSoulIndex,
  yinYangGender,
} from '@/lib/ziwei/labels';

describe('ziwei labels', () => {
  it('maps palace names to the screenshot wording', () => {
    expect(displayPalaceName('僕役')).toBe('交友宮');
    expect(displayPalaceName('官祿')).toBe('事業宮');
    expect(
      displayPalaceName('命宮', { isSoulPalace: true, isBodyPalace: true }),
    ).toBe('命宮-身宮');
    expect(displayPalaceName('遷移')).toBe('遷移宮');
  });

  it('maps brightness 得／不 to 地／陷', () => {
    expect(displayBrightness('得')).toBe('地');
    expect(displayBrightness('不')).toBe('陷');
    expect(displayBrightness('廟')).toBe('廟');
    expect(displayBrightness('陷')).toBe('陷');
  });

  it('builds 海中金四局 from 命宮納音', () => {
    expect(nayinOf('甲', '子')).toBe('海中金');
    expect(fiveElementsLabel('海中金', '金四局')).toBe('海中金四局');
  });

  it('labels 陰女 for a yin-stem year', () => {
    expect(yinYangGender('癸', 'female')).toBe('陰女');
    expect(yinYangGender('甲', 'male')).toBe('陽男');
  });

  it('rotates palace names from 命宮 at 子 (index 10)', () => {
    const names = palaceNamesFromSoulIndex(10);
    expect(names[10]).toBe('命宮');
    expect(names[9]).toBe('兄弟');
    expect(names[0]).toBe('福德');
    expect(names[2]).toBe('官祿');
    expect(names[3]).toBe('僕役');
  });
});
