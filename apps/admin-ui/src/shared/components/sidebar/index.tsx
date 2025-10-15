"use client";
import useAdmin from "apps/admin-ui/src/hooks/useAdmin";
import useSidebar from "apps/admin-ui/src/hooks/useSidebar";
import { usePathname } from "next/navigation";
import React, { useEffect } from "react";
import Box from "../box";
import { Sidebar } from "./sidebar.styles";
import Link from "next/link";
import Logo from "apps/admin-ui/src/app/assets/svgs/logo";
import SidebarItem from "./sidebar.item";
import Home from "apps/admin-ui/src/app/assets/svgs/home";
import SidebarMenu from "./sidebar.menu";
import {
  BellPlus,
  BellRing,
  FileClock,
  ListOrdered,
  LogOut,
  PackageSearch,
  PencilRuler,
  Settings,
  Store,
  Users,
} from "lucide-react";
import Payment from "apps/admin-ui/src/app/assets/svgs/payment";

const SidebarWrapper = () => {
  const { activeSidebar, setActiveSidebar } = useSidebar();
  const pathName = usePathname();
  const { admin } = useAdmin();

  useEffect(() => {
    setActiveSidebar(pathName);
  }, [pathName, setActiveSidebar]);

  const getIconColor = (route: string) =>
    activeSidebar === route ? "#0085ff" : "#969696";

  return (
    <Box
      css={{
        height: "100vh",
        zIndex: 202,
        position: "sticky",
        padding: "8px",
        top: "0",
        overflowY: "scroll",
        scrollbarWidth: "none",
      }}
      className="sidebar-wrapper"
    >
      <Sidebar.Header>
        <Box>
          <Link href={"/"} className="flex justify-center text-center gap-2">
            <Logo />
            <Box>
              <h3 className="text-xl font-medium text-[#ecedee]">
                {admin?.name}
              </h3>
              <h5 className="font-medium pl-2 text-xs text-[#ecedeecf] whitespace-nowrap overflow-hidden text-ellipsis max-w-[170px]">
                {admin?.email}
              </h5>
            </Box>
          </Link>
        </Box>
      </Sidebar.Header>

      <div className="block my-3 h-full">
        <Sidebar.Body className="body sidebar">
          <SidebarItem
            title="Админ самбар"
            icon={<Home fill={getIconColor("/dashboard")} />}
            isActive={activeSidebar === "/dashboard"}
            href="/dashboard"
          />

          <div className="mt-2 block">
            {/* Үндсэн цэс */}
            <SidebarMenu title="Үндсэн цэс">
              <SidebarItem
                isActive={activeSidebar === "/dashboard/orders"}
                title="Захиалгууд"
                href="/dashboard/orders"
                icon={
                  <ListOrdered
                    size={26}
                    color={getIconColor("/dashboard/orders")}
                  />
                }
              />

              <SidebarItem
                isActive={activeSidebar === "/dashboard/payments"}
                title="Төлбөрүүд"
                href="/dashboard/payments"
                icon={<Payment fill={getIconColor("/dashboard/payments")} />}
              />

              <SidebarItem
                isActive={activeSidebar === "/dashboard/products"}
                title="Бүтээгдэхүүн"
                href="/dashboard/products"
                icon={
                  <PackageSearch
                    size={22}
                    color={getIconColor("/dashboard/products")}
                  />
                }
              />

              <SidebarItem
                isActive={activeSidebar === "/dashboard/events"}
                title="Арга хэмжээ"
                href="/dashboard/events"
                icon={
                  <BellPlus
                    size={24}
                    color={getIconColor("/dashboard/events")}
                  />
                }
              />

              <SidebarItem
                isActive={activeSidebar === "/dashboard/users"}
                title="Хэрэглэгчид"
                href="/dashboard/users"
                icon={
                  <Users size={24} color={getIconColor("/dashboard/users")} />
                }
              />

              <SidebarItem
                isActive={activeSidebar === "/dashboard/sellers"}
                title="Борлуулагчид"
                href="/dashboard/sellers"
                icon={
                  <Store size={22} color={getIconColor("/dashboard/sellers")} />
                }
              />
            </SidebarMenu>

            {/* Удирдлага */}
            <SidebarMenu title="Удирдлага">
              <SidebarItem
                isActive={activeSidebar === "/dashboard/loggers"}
                title="Логууд"
                href="/dashboard/loggers"
                icon={
                  <FileClock
                    size={22}
                    color={getIconColor("/dashboard/loggers")}
                  />
                }
              />
              <SidebarItem
                isActive={activeSidebar === "/dashboard/management"}
                title="Тохиргоо"
                href="/dashboard/management"
                icon={
                  <Settings
                    size={22}
                    color={getIconColor("/dashboard/management")}
                  />
                }
              />
              <SidebarItem
                isActive={activeSidebar === "/dashboard/notifications"}
                title="Мэдэгдлүүд"
                href="/dashboard/notifications"
                icon={
                  <BellRing
                    size={24}
                    color={getIconColor("/dashboard/notifications")}
                  />
                }
              />
            </SidebarMenu>

            {/* Тохируулга */}
            <SidebarMenu title="Тохируулга">
              <SidebarItem
                isActive={activeSidebar === "/dashboard/customization"}
                title="Бүх тохируулга"
                href="/dashboard/customization"
                icon={
                  <PencilRuler
                    size={22}
                    color={getIconColor("/dashboard/customization")}
                  />
                }
              />
            </SidebarMenu>

            {/* Нэмэлтүүд */}
            <SidebarMenu title="Нэмэлтүүд">
              <SidebarItem
                isActive={activeSidebar === "/logout"}
                title="Гарах"
                href="/"
                icon={<LogOut size={20} color={getIconColor("/logout")} />}
              />
            </SidebarMenu>
          </div>
        </Sidebar.Body>
      </div>
    </Box>
  );
};

export default SidebarWrapper;
