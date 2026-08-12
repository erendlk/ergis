"use client";

import { useState } from "react";
import Map from "../components/Map";

const layers = [
  {
    id: "base",
    name: "Temel Harita",
    icon: "▦",
  },
  {
    id: "satellite",
    name: "Uydu Görüntüsü",
    icon: "◉",
  },
  {
    id: "parcel",
    name: "Parseller",
    icon: "▤",
  },
  {
    id: "zoning",
    name: "İmar Planları",
    icon: "▥",
  },
  {
    id: "building",
    name: "Binalar",
    icon: "▧",
  },
  {
    id: "transport",
    name: "Ulaşım",
    icon: "⇄",
  },
  {
    id: "green",
    name: "Yeşil Alanlar",
    icon: "♧",
  },
  {
    id: "education",
    name: "Eğitim Alanları",
    icon: "◇",
  },
  {
    id: "health",
    name: "Sağlık Alanları",
    icon: "+",
  },
];

export default function Home() {
  const [selectedLayer, setSelectedLayer] = useState("base");

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-100 text-slate-900">
      {/* =====================================================
          ÜST MENÜ
      ===================================================== */}

      <header className="h-16 border-b border-slate-200 bg-white flex items-center px-5">
        {/* LOGO */}

        <div className="flex items-center gap-3 w-64">
          <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
            E
          </div>

          <div>
            <div className="text-lg font-bold">
              ERGİS
            </div>

            <div className="text-[10px] uppercase tracking-widest text-slate-400">
              Urban Intelligence
            </div>
          </div>
        </div>

        {/* ARAMA */}

        <div className="flex-1 max-w-2xl">
          <div className="mx-auto flex items-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
            <span className="mr-3 text-slate-400">
              ⌕
            </span>

            <input
              type="text"
              placeholder="İl, ilçe, mahalle, adres veya parsel ara..."
              className="w-full bg-transparent text-sm outline-none"
            />

            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500">
              CTRL K
            </span>
          </div>
        </div>

        {/* SAĞ MENÜ */}

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Projeler
          </button>

          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Yardım
          </button>

          <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center font-semibold">
            E
          </div>
        </div>
      </header>

      {/* =====================================================
          ANA ALAN
      ===================================================== */}

      <div className="flex h-[calc(100vh-64px)]">
        {/* =================================================
            SOL PANEL
        ================================================= */}

        <aside className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Harita
            </div>

            <div className="mt-1 text-base font-bold">
              Katmanlar
            </div>
          </div>

          <div className="p-3">
            {layers.map((layer) => {
              const active = selectedLayer === layer.id;

              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setSelectedLayer(layer.id)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-md text-sm ${
                      active
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {layer.icon}
                  </span>

                  <span className="flex-1 text-sm font-medium">
                    {layer.name}
                  </span>

                  <span
                    className={`h-2 w-2 rounded-full ${
                      active
                        ? "bg-emerald-500"
                        : "bg-slate-200"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* ARAÇLAR */}

          <div className="mt-3 border-t border-slate-100 p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Araçlar
            </div>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                ◇
              </span>

              Mekânsal Analiz
            </button>

            <button
              type="button"
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-600">
                ✦
              </span>

              Yapay Zekâ
            </button>
          </div>
        </aside>

        {/* =================================================
            HARİTA
        ================================================= */}

        <section className="relative flex-1 overflow-hidden">
          <Map />
        </section>

        {/* =================================================
            SAĞ PANEL
        ================================================= */}

        <aside className="w-80 shrink-0 border-l border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Bilgi
            </div>

            <div className="mt-1 text-base font-bold">
              Özellikler
            </div>
          </div>

          <div className="p-5">
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-2xl">
                ⌖
              </div>

              <div className="mt-3 text-sm font-semibold">
                Haritadan bir nesne seçin
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                Parsel, bina, imar planı
                veya çizdiğiniz bir
                mekânsal nesneyi seçtiğinizde
                detayları burada
                görüntülenecek.
              </p>
            </div>

            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              ✦ Yapay Zekâ ile Analiz Et
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}