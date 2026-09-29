import type { ComponentType } from 'react'

export type DialogComponent = ComponentType<{ onClose: () => void } & Record<string, unknown>>
const registry = new Map<string, DialogComponent>()

/** Features register modal dialogs by kind; open them with actions.openDialog(kind, props). */
export function registerDialog(kind: string, c: DialogComponent) { registry.set(kind, c) }
export function getDialog(kind: string) { return registry.get(kind) }
