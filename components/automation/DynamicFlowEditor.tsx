"use client"

import dynamic from "next/dynamic"
import { EditorSkeleton } from "./flow-editor"

export const DynamicFlowEditor = dynamic(() => import("./flow-editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
})
