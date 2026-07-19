declare module '*.sql?raw' {
  const content: string;
  export default content;
}

declare namespace App {
  interface Locals {
    user: { id: number; email: string } | null;
  }
}
