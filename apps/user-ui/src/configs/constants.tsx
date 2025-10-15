export const navItems: NavItemsTypes[] = [
  {
    // title: "Home",
    title: "Нүүр",
    href: "/",
  },
  {
    // title: "Products",
    title: "Бүтээгдэхүүнүүд",
    href: "/products",
  },
  {
    // title: "Shops",
    title: "Бүтээгдэхүүнүүд",
    href: "/shops",
  },
  {
    // title: "Offers",
    title: "Хямдрал",
    href: "/offers",
  },
  {
    // title: "Become A Seller",
    title: "Борлуулагчаар бүртгүүлэх",
    href: `${
      process.env.NEXT_PUBLIC_SELLER_SERVER_URI ||
      "https://seller.nomadnet.shop"
    }/signup`,
  },
];
