import { Paper } from '@mantine/core';
import { BirthForm } from '@/components/BirthForm';
import { MantineRoot } from '@/components/MantineRoot';

export default function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-3xl font-medium tracking-wide sm:text-4xl">
          排盤
        </h1>
        <p className="text-muted leading-relaxed">
          輸入一次出生日期、時間、地點與性別，同時排出人類圖（個性／設計 26
          顆星體啟動）、紫微斗數十二宮與八字命盤。
        </p>
      </div>
      <MantineRoot>
        <Paper withBorder radius="md" shadow="md" className="p-5 sm:p-8">
          <BirthForm />
        </Paper>
      </MantineRoot>
    </div>
  );
}
