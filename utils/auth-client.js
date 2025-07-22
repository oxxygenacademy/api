class AuthClient {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
    this.refreshPromise = null;
  }

  // تسجيل الدخول
  async login(email, password, rememberMe = false) {
    const response = await fetch(`${this.baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember_me: rememberMe })
    });

    const data = await response.json();
    
    if (data.success) {
      this.setTokens(data.data.access_token, data.data.refresh_token);
      return data;
    }
    
    throw new Error(data.error?.message || 'فشل في تسجيل الدخول');
  }

  // حفظ التوكنات
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }

  // مسح التوكنات
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  // تجديد التوكن
  async refreshAccessToken() {
    // تجنب التجديد المتزامن
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._performRefresh();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  async _performRefresh() {
    if (!this.refreshToken) {
      throw new Error('لا يوجد توكن تجديد');
    }

    const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.refreshToken })
    });

    const data = await response.json();

    if (data.success) {
      this.setTokens(data.data.access_token, data.data.refresh_token);
      return data.data.access_token;
    }

    // فشل التجديد - مسح التوكنات
    this.clearTokens();
    throw new Error('انتهت صلاحية الجلسة');
  }

  // طلب API مع تجديد تلقائي
  async apiCall(url, options = {}) {
    const makeRequest = async (token) => {
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': token ? `Bearer ${token}` : undefined
        }
      });
    };

    // المحاولة الأولى
    let response = await makeRequest(this.accessToken);

    // إذا انتهت صلاحية التوكن
    if (response.status === 401) {
      const errorData = await response.json();
      
      if (errorData.error?.code === 'TOKEN_EXPIRED') {
        try {
          // تجديد التوكن
          const newToken = await this.refreshAccessToken();
          
          // إعادة المحاولة مع التوكن الجديد
          response = await makeRequest(newToken);
        } catch (refreshError) {
          // فشل التجديد - إعادة توجيه لتسجيل الدخول
          this.clearTokens();
          window.location.href = '/login';
          throw refreshError;
        }
      }
    }

    return response;
  }

  // تسجيل الخروج
  async logout() {
    try {
      await fetch(`${this.baseURL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ refresh_token: this.refreshToken })
      });
    } finally {
      this.clearTokens();
    }
  }

  // مثال على استخدام API
  async getUserProfile() {
    const response = await this.apiCall(`${this.baseURL}/api/user/profile`);
    return response.json();
  }

  async getCourses() {
    const response = await this.apiCall(`${this.baseURL}/api/courses`);
    return response.json();
  }
}

// الاستخدام
const auth = new AuthClient();

// تسجيل الدخول
auth.login('oxxygenacademy@test.com', '123456', true)
  .then(data => console.log('تم تسجيل الدخول:', data))
  .catch(error => console.error('خطأ:', error));

// استخدام API مع تجديد تلقائي
auth.getUserProfile()
  .then(data => console.log('بيانات المستخدم:', data))
  .catch(error => console.error('خطأ:', error));