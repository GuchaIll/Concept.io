
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios, { type AxiosResponse } from 'axios';
import type { IAuthenticatedUser, IResponse } from '../common/server.responses';
import './auth.css';

interface AuthFormData {
  name?: string;
  email: string;
  password: string;
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState<AuthFormData>({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState<Partial<AuthFormData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const newErrors: Partial<AuthFormData> = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      if (isLogin) {
        const res: AxiosResponse = await axios.request({
          method: 'post',
          url: `/auth/tokens/${encodeURIComponent(formData.email)}`,
          data: { password: formData.password },
          validateStatus: () => true
        });

        const data: IResponse = res.data;
        if (res.status === 200 && data.name === 'UserAuthenticated') {
          const payload = data.payload as IAuthenticatedUser;
          if (!payload || !payload.token || !payload.user || !payload.user.credentials || !payload.user.credentials.username) {
            setError('Authentication failed');
            return;
          }
          localStorage.setItem('token', payload.token);
          navigate('/canvas');
        } else {
          setError(data.message || 'Login failed');
        }
      } else {
        // Registration
        if (!formData.name) {
          setError('Name is required for registration');
          return;
        }

        const res: AxiosResponse = await axios.request({
          method: 'post',
          url: '/auth/users',
          data: {
            credentials: { 
              username: formData.email, 
              password: formData.password 
            },
            extra: formData.name
          },
          validateStatus: () => true
        });

        const data: IResponse = res.data;
        if (res.status === 201 && data.name === 'UserRegistered') {
          setError(null);
          // Switch to login mode after successful registration
          setIsLogin(true);
          setFormData({ ...formData, password: '' });
        } else {
          setError(data.message || 'Registration failed');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Animated background */}
      <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 animate-gradient-x">
        <div className="absolute inset-0 bg-grid-white/[0.2] bg-grid-pattern"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
      </div>

      {/* Main title */}
      <div className="relative mb-8">
        <h1 className="text-6xl font-bold text-white text-center mb-2 drop-shadow-glow animate-pulse-slow">
          Concept.io
        </h1>
        <p className="text-xl text-white/80 text-center animate-fade-in">
          Create, Collaborate, Innovate
        </p>
      </div>

      {/* Auth container */}
      <div className="max-w-md w-full space-y-8 relative">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-8 space-y-6">
          <div>
            <h2 className="text-center text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {isLogin ? 'Welcome Back' : 'Join Us Today'}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                {isLogin ? 'Sign up now' : 'Sign in'}
              </button>
            </p>
          </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          
          <div className="space-y-4">
            {!isLogin && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label>
                <div className="mt-1">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required={!isLogin}
                    className={`appearance-none block w-full px-3 py-2 border ${
                      !isLogin && errors.name ? 'border-red-300' : 'border-gray-300'
                    } rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm
                    transition-all duration-200 ease-in-out`}
                    placeholder="John Doe"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  {!isLogin && errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                  )}
                </div>
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`appearance-none block w-full px-3 py-2 border ${
                    errors.email ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm
                  transition-all duration-200 ease-in-out`}
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  required
                  className={`appearance-none block w-full px-3 py-2 border ${
                    errors.password ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm
                  transition-all duration-200 ease-in-out`}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white 
              ${isLoading
                ? 'bg-indigo-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
              } transition-all duration-200 ease-in-out transform hover:scale-[1.02]`}
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                isLogin ? 'Sign in' : 'Create account'
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
