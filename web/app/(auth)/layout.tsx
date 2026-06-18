// (auth)/layout.tsx
// Centered layout for login and signup pages

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emerald-700">TrueFlow</h1>
          <p className="text-gray-500 text-sm mt-1">Your true financial flow.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
