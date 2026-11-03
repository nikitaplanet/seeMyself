import { Paper } from '@mantine/core';
import { BirthForm } from '@/components/BirthForm';
import { MantineRoot } from '@/components/MantineRoot';

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-5">
      <h1 className="text-2xl font-bold sm:text-3xl">排 盤</h1>
      <p className="text-muted">
        輸入一次出生日期、時間、地點與性別，同時排出人類圖（個性／設計 26
        顆星體啟動）、紫微斗數十二宮與八字命盤。
      </p>
      <MantineRoot>
        <Paper withBorder radius="md" className="p-5 sm:p-8">
          <BirthForm />
        </Paper>
      </MantineRoot>
    </div>
  );
}
