export function ColucciLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center rounded-lg bg-white px-3 py-2 shadow-sm">
      <img
        src="/logo-colucci.png"
        alt="Colucci Imóveis"
        className={compact ? "h-8 w-auto" : "h-10 w-auto"}
      />
    </div>
  )
}
