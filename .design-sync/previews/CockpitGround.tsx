import { useEffect } from 'react';
import { Button, CockpitGround, ConsolePanel, Lamp, Readouts, Row, Segmented } from 'fox3-academy-ui';

// The skin is an attribute on the document element, so one document can only wear one: Western gull
// grey and Soviet turquoise get a cell each.
//
// The card mounts every cell inside the global CockpitGround provider, and the provider's effect
// writes its own default skin after the nested cell's effect has written this one. Re-asserting the
// skin once the effect flush is over is what keeps a `cockpit="ru"` cell turquoise.
const useSkin = (cockpit: 'us' | 'ru') => {
  useEffect(() => {
    queueMicrotask(() => document.documentElement.setAttribute('data-cockpit', cockpit));
  }, [cockpit]);
};

export const WesternSkin = () => {
  useSkin('us');
  return (
    <CockpitGround cockpit="us">
      <ConsolePanel title="Radar" actions={<Button label="Reset" variant="ghost" size="s" />}>
        <Segmented
          id="preview-ground-us-mode"
          label="Mode"
          value="tws"
          options={[
            { value: 'rws', label: 'RWS' },
            { value: 'tws', label: 'TWS' },
            { value: 'stt', label: 'STT' },
          ]}
        />
        <Readouts
          id="preview-ground-us-rows"
          rows={[
            { id: 'jet', label: 'Jet', value: 'F-15C' },
            { id: 'range', label: 'Range', value: '32', unit: 'nm' },
            { id: 'alt', label: 'Altitude', value: '28000', unit: 'ft' },
          ]}
        />
        <Row
          items={[
            <Lamp id="preview-ground-us-shoot" label="Shoot" tone="ok" state="on" />,
            <Button label="Launch" variant="primary" keys="RAlt + Space" />,
          ]}
        />
      </ConsolePanel>
    </CockpitGround>
  );
};

export const SovietSkin = () => {
  useSkin('ru');
  return (
    <CockpitGround cockpit="ru">
      <ConsolePanel title="Радар" actions={<Button label="Сброс" variant="ghost" size="s" />}>
        <Segmented
          id="preview-ground-ru-mode"
          label="Режим"
          value="snp"
          options={[
            { value: 'obz', label: 'ОБЗ ДВБ' },
            { value: 'snp', label: 'СНП ДВБ' },
            { value: 'atk', label: 'АТК ДВБ' },
          ]}
        />
        <Readouts
          id="preview-ground-ru-rows"
          rows={[
            { id: 'jet', label: 'Самолёт', value: 'Су-27С' },
            { id: 'range', label: 'Дальность', value: '52', unit: 'км' },
            { id: 'alt', label: 'Высота', value: '8500', unit: 'м' },
          ]}
        />
        <Row
          items={[
            <Lamp id="preview-ground-ru-shoot" label="ПР" tone="ok" state="on" />,
            <Button label="Пуск" variant="primary" keys="Space" />,
          ]}
        />
      </ConsolePanel>
    </CockpitGround>
  );
};
