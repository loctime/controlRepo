import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "./firebase"

export async function bootstrapUserRoot(uid: string): Promise<void> {
  if (typeof window === "undefined" || !db) return

  const rootPath = `files/controlrepo/user/${uid}/root`
  const rootRef = doc(db, rootPath)

  try {
    const rootDoc = await getDoc(rootRef)

    if (!rootDoc.exists()) {
      await setDoc(rootRef, {
        id: "root",
        type: "folder",
        name: "ControlRepo",
        parentId: null,
        createdAt: serverTimestamp(),
        metadata: {
          app: "controlrepo",
          isRoot: true,
        },
      })
    }
  } catch (error) {
    throw error
  }
}

