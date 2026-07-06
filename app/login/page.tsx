import { redirect } from 'next/navigation';

// Ruta genérica: por defecto siempre lleva al portal del rider.
// El acceso de administración vive en /gestor/login (no enlazada).
export default function LoginAliasPage() {
  redirect('/rider/login');
}
