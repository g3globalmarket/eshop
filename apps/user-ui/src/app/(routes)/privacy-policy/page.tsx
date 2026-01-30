"use client";

import Link from "next/link";
import React from "react";

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-gray-50 p-6 pb-14 min-h-screen">
      <div className="md:max-w-7xl mx-auto">
        <div className="bg-white p-8 rounded-md shadow-sm border border-gray-100 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Нууцлалын бодлого
          </h1>
          <p className="text-gray-600 mb-6">
            Энэ хуудас удахгүй нээгдэх болно.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            Нүүр хуудас руу буцах
          </Link>
        </div>
      </div>
    </div>
  );
}

