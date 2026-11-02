import { Paper } from '@mantine/core';
import { BirthForm } from '@/components/BirthForm';
import { MantineRoot } from '@/components/MantineRoot';

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold sm:text-3xl">人類圖排盤</h1>
      <p className="mt-2 text-muted">
        輸入出生日期、時間與地點，計算個性與設計兩組共 26 個星體啟動，推導類型、內在權威、人生角色等屬性並繪出人體圖。
      </p>
      <MantineRoot>
        <Paper withBorder radius="md" className="mt-8 p-5 sm:p-8">
          <BirthForm />
        </Paper>
      </MantineRoot>
    </div>
  );
}
