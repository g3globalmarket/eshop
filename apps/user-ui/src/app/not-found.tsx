import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <h1 className="text-6xl font-bold text-gray-800 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-gray-700 mb-2">Хуудас олдсонгүй</h2>
      <p className="text-gray-600 mb-6 text-center">
        Таны хайж буй хуудас байхгүй эсвэл шилжсэн байна.
      </p>
      <Link
        href="/"
        className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition"
      >
        Нүүр хуудас руу буцах
      </Link>
    </div>
  );
}

