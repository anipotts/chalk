import { redirect } from 'next/navigation';

export default async function YTRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/watch?v=${encodeURIComponent(id)}`);
}
