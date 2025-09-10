import { Disclosure, DisclosureButton, DisclosurePanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Bars3Icon, BellIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {Link } from 'react-router-dom'

const navigation = [
  { name: 'About', href: '/about', current: true },
  { name: 'Dashboard', href: '/', current: true },
  { name: 'Team', href: '/team', current: false },
  { name: 'Projects', href: '/projects', current: false },
  { name: 'Canvas', href: '/canvas', current: false },
]

function classNames(...classes : (string | boolean)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function Example() {
  return (
    <Disclosure as="nav" className="fixed w-full top-0 z-50">
      {({ open }) => (
      <>
        <div className="w-full bg-[#3D365C]/90 backdrop-blur-md shadow-lg">
          <div className="relative flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
              {/* Mobile menu button*/}
              <DisclosureButton 
                className="group relative inline-flex items-center justify-center rounded-md p-2 text-white/70 hover:bg-[#7C4585]/30 hover:text-white focus:outline-2 focus:-outline-offset-1 focus:outline-[#F8B55F] transition-colors duration-200"
              >
                <span className="absolute -inset-0.5" />
                <span className="sr-only">Open main menu</span>
                <Bars3Icon aria-hidden="true" className={`block size-6 transition-transform duration-200 ${open ? 'rotate-90 opacity-0' : 'rotate-0 opacity-100'}`} />
                <XMarkIcon aria-hidden="true" className={`absolute size-6 transition-transform duration-200 ${open ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0'}`} />
              </DisclosureButton>
            </div>
            <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
              <div className="flex shrink-0 items-center">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#F8B55F] to-[#C95792] p-0.5">
                  <div className="h-full w-full rounded-[7px] bg-[#3D365C] flex items-center justify-center">
                    <img src="/logo-transparent.png" alt="Logo" className="h-8 w-8 object-contain animate-spin" />
                  </div>
                </div>
              </div>
              <div className="hidden sm:ml-6 sm:block">
                <div className="flex space-x-1">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      aria-current={item.current ? 'page' : undefined}
                      className={classNames(
                        item.current 
                          ? 'bg-[#7C4585] text-white shadow-lg shadow-[#7C4585]/20' 
                          : 'text-white/80 hover:bg-[#7C4585]/30 hover:text-white',
                        'rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105'
                      )}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
              <button
                type="button"
                className="relative rounded-lg p-2 text-white/80 hover:bg-[#7C4585]/30 hover:text-white focus:outline-2 focus:outline-offset-2 focus:outline-[#F8B55F] transition-all duration-200 hover:scale-105"
              >
                <span className="absolute -inset-1.5" />
                <span className="sr-only">View notifications</span>
                <div className="relative">
                  <BellIcon aria-hidden="true" className="size-6" />
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#F8B55F] border-2 border-[#3D365C] animate-pulse"></span>
                </div>
              </button>

              {/* Profile dropdown */}
              <Menu as="div" className="relative ml-3">
                <MenuButton className="relative flex rounded-lg hover:scale-105 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F8B55F]">
                  <span className="absolute -inset-1.5" />
                  <span className="sr-only">Open user menu</span>
                  <div className="size-10 rounded-lg   p-0.5">
                    <img
                      alt=""
                      src="/avatars/duck.png"
                      className="size-9 rounded-[7px]  object-cover"
                    />
                  </div>
                </MenuButton>

                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-xl bg-white/95 backdrop-blur-md py-1 shadow-lg shadow-black/5 outline outline-white/10 transition-all duration-200 data-closed:scale-95 data-closed:opacity-0"
                >
                  <MenuItem>
                    <Link
                      to="#"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-[#7C4585]/10 hover:text-[#3D365C] transition-colors duration-200"
                    >
                      Your profile
                    </Link>
                  </MenuItem>
                  <MenuItem>
                    <Link
                      to="#"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-[#7C4585]/10 hover:text-[#3D365C] transition-colors duration-200"
                    >
                      Settings
                    </Link>
                  </MenuItem>
                  <MenuItem>
                    <Link
                      to="#"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-[#7C4585]/10 hover:text-[#3D365C] transition-colors duration-200"
                    >
                      Sign out
                    </Link>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <DisclosurePanel className="sm:hidden">
          <div className="space-y-1 px-4 sm:px-6 lg:px-8 pb-3 pt-2 bg-[#3D365C]/90 backdrop-blur-md shadow-lg">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={classNames(
                  item.current 
                    ? 'bg-[#7C4585] text-white' 
                    : 'text-white/80 hover:bg-[#7C4585]/30 hover:text-white',
                  'block rounded-md px-3 py-2 text-base font-medium transition-colors duration-200'
                )}
                aria-current={item.current ? 'page' : undefined}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </DisclosurePanel>
      </>
      )}
    </Disclosure>
  )
}
