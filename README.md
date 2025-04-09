# 🚀 ADR Reservation System

<div align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
</div>

<br />

<div align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/status-active-brightgreen" alt="Status" />
</div>

<br />

> A modern, secure, and user-friendly slot reservation system for the ADR Lab. Streamline your booking process with an intuitive interface and powerful admin tools.

## ✨ Key Features

### 📅 Smart Booking
- Quick slot booking
- Calendar integration
- Email confirmations
- Reservation management
- Real-time availability

### 👨‍💼 Admin Dashboard
- Slot management
- Booking statistics

### User Profile
- Reservation Management

## 🎨 UI/UX Highlights
- Modern, clean design
- Dark/Light mode support
- Responsive layout

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/montimage-project/adr-reservation.git
cd adr-reservation

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Start development server
npm run dev
```

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Supabase account
- Modern web browser
- EmailJS

## 🔧 Configuration

Create a `.env.local` file with:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SUPABASE_SERVICE_KEY=your-service-role-key
VITE_JWT_SECRET=your-jwt-secret
VITE_EMAILJS_SERVICE_ID=
VITE_EMAILJS_PUBLIC_KEY=
VITE_EMAILJS_CANCELLATION_TEMPLATE_ID=adr_reservation_cancel
VITE_EMAILJS_CONFIRMATION_TEMPLATE_ID=adr_reservation_confirm
```

## 🏗️ Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── lib/          # Utility functions
├── utils/        # Helper functions
```

## 🛡️ Security Features

- Row Level Security (RLS)
- JWT authentication
- Secure password hashing
- Protected admin routes

## 🎯 Tech Stack

- **Frontend**: React, Vite
- **Styling**: Tailwind CSS, Material Tailwind
- **Backend**: Supabase
- **Authentication**: JWT
- **Email**: EmailJS

## 📄 License

This project is licensed under the MONTIMAGE License
## 🙏 Acknowledgments

- [React](https://reactjs.org/) - UI Framework
- [Vite](https://vitejs.dev/) - Build Tool
- [Supabase](https://supabase.io/) - Backend Service
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Material Tailwind](https://www.material-tailwind.com/) - UI Components

## 📞 Support

For support, email developer@montimage.com or open an issue in the repository.

---

<div align="center">
  <sub>Built with ❤️ by the ADR Lab Team</sub>
</div>
