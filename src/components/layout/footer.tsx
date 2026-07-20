export function Footer() {
  return (
    <footer className="border-t border-border bg-card px-4 py-4 md:px-8">
      <p className="text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Fluxo de Equipamentos. Todos os direitos reservados.
      </p>
    </footer>
  );
}
