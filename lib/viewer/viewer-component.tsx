"use client";

// This file uses useState/useEffect/useRef, so it is a Client Component, and
// saying so is not optional here.
//
// Without the directive Next treats it as a Server Component on a COLD
// compile, the module fails to build, the page's client chunk is never
// produced, and the client reference resolves to undefined — which React
// reports as "Element type is invalid ... got: undefined" from somewhere that
// names none of this. /inventory had been 500ing in production on exactly
// that since at least 7 August.
//
// It only ever worked in dev because an incremental recompile re-enters the
// module with the graph already built, which is why editing any file "fixed"
// the page and restarting broke it again. Inheriting client-ness from an
// importer is not something to rely on for a module that owns hooks.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useEffect, useRef, useState } from "react";
import { buildViewerSrc, ViewerItemInput } from "./viewer";
import { ViewerApi } from "./viewer-api";

export function Viewer({
  apiKey,
  embedUrl,
  cdn,
  icon,
  item,
  onApi,
  origin,
  title = "CS2 3D viewer",
  ...props
}: Omit<ComponentPropsWithoutRef<"iframe">, "src"> & {
  apiKey?: string;
  embedUrl?: string;
  cdn?: string;
  icon?: boolean;
  item?: ViewerItemInput;
  onApi: (api: ViewerApi | undefined) => void;
  origin?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // `?item=` only seeds the initial state; capture the src once so re-renders
  // (or a changed `item` prop) don't reload the iframe. Drive later changes
  // through the api, or remount with a `key`.
  const [src] = useState(() =>
    buildViewerSrc(item, { embedUrl, cdn, key: apiKey, icon })
  );
  const onApiRef = useRef(onApi);
  const originRef = useRef(origin);

  useEffect(() => {
    onApiRef.current = onApi;
  }, [onApi]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null) {
      return;
    }
    const api = new ViewerApi(iframe, { origin: originRef.current });
    onApiRef.current(api);
    return () => {
      api.destroy();
      onApiRef.current(undefined);
    };
  }, []);

  return <iframe ref={iframeRef} src={src} title={title} allowTransparency={true} style={{ backgroundColor: 'transparent', ...props.style }} {...props} />;
}
