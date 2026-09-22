'use client';

import { useState } from 'react';
import { validarArchivoCliente } from '@/lib/compressImage';

/**
 * Gestiona los archivos que el rider adjunta a un formulario.
 *
 * Nace de un fallo real: el rider elegía dos archivos (un PNG y un JPEG),
 * pulsaba "seleccionar" y NO SE SELECCIONABA NADA. El motivo eran dos
 * comportamientos del código anterior que se sumaban:
 *
 *   1. Si UN archivo no pasaba la validación, se descartaba la selección
 *      COMPLETA (`setArchivos([])` + vaciar el input). Bastaba con que
 *      uno fallara para quedarse sin ninguno, y el aviso solo nombraba al
 *      primero — así que el rider no sabía cuál sobraba.
 *
 *   2. Los selectores de Android (Drive, "Archivos recientes", Smart
 *      Connect...) entregan los archivos con `type` vacío muy a menudo.
 *      Ese vacío no estaba en la lista de permitidos, así que un JPG
 *      normal se rechazaba como "formato desconocido" y disparaba el
 *      punto 1. Ahora el tipo se deduce de la extensión cuando el
 *      navegador no lo informa (ver tipoDeArchivo).
 *
 * Además ACUMULA entre selecciones: un <input type="file"> reemplaza su
 * contenido cada vez que se abre, así que elegir "otro archivo más" en
 * una segunda pasada borraba el anterior. Ahora se van sumando y se
 * pueden quitar de uno en uno.
 */
export interface ArchivosAdjuntos {
  archivos: File[];
  error: string | null;
  alElegir: (e: React.ChangeEvent<HTMLInputElement>) => void;
  quitar: (indice: number) => void;
}

export function useArchivosAdjuntos(tiposPermitidos: string[], maximo: number): ArchivosAdjuntos {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    // El input se vacía SIEMPRE: su contenido ya no se usa para enviar
    // (eso lo hace el estado), y así el mismo archivo se puede volver a
    // elegir si antes se quitó.
    e.target.value = '';
    if (elegidos.length === 0) return;

    const validos: File[] = [];
    const rechazados: string[] = [];

    for (const f of elegidos) {
      const err = validarArchivoCliente(f, tiposPermitidos);
      if (err) rechazados.push(f.name);
      else validos.push(f);
    }

    setArchivos((previos) => {
      // Se descartan repetidos por nombre y tamaño: si el rider vuelve a
      // elegir el mismo archivo, no se duplica.
      const clave = (f: File) => `${f.name}|${f.size}`;
      const yaEstan = new Set(previos.map(clave));
      const nuevos = validos.filter((f) => !yaEstan.has(clave(f)));
      const total = [...previos, ...nuevos];

      if (total.length > maximo) {
        setError(`Puedes adjuntar como máximo ${maximo} archivos.`);
        return total.slice(0, maximo);
      }
      // Los válidos SE CONSERVAN aunque alguno haya sido rechazado: el
      // aviso dice cuál sobra, en vez de obligar a empezar de cero.
      setError(
        rechazados.length > 0
          ? `No se pudo añadir ${rechazados.join(', ')} (formato no admitido o supera los 10 MB). El resto sí se ha adjuntado.`
          : null
      );
      return total;
    });
  }

  function quitar(indice: number) {
    setArchivos((previos) => previos.filter((_, i) => i !== indice));
    setError(null);
  }

  return { archivos, error, alElegir, quitar };
}
