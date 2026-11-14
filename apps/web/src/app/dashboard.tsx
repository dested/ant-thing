import { PostsDemo } from '~/components/demo/posts-demo' // demo

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
      {/* demo:start */}
      <PostsDemo />
      {/* demo:end */}
    </div>
  )
}
