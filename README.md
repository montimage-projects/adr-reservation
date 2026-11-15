# 🚀 ADR Reservation System

<div align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite" />
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" />
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

- Node.js (v20 or higher)
- npm or yarn
- Firebase project with Firestore enabled
- Modern web browser
- EmailJS

## 🔧 Configuration

Create a `.env.local` file with:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
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

- Firestore security rules
- JWT authentication
- Secure password hashing
- Protected admin routes

## 🎯 Tech Stack

- **Frontend**: React, Vite
- **Styling**: Tailwind CSS, Material Tailwind
- **Backend**: Firebase (Firestore, Authentication)
- **Authentication**: JWT
- **Email**: EmailJS

## 📄 License

This project is licensed under the MONTIMAGE License
## 🙏 Acknowledgments

- [React](https://reactjs.org/) - UI Framework
- [Vite](https://vitejs.dev/) - Build Tool
- [Firebase](https://firebase.google.com/) - Backend Service
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Material Tailwind](https://www.material-tailwind.com/) - UI Components

## 📞 Support

For support, email developer@montimage.com or open an issue in the repository.

---

<div align="center">
  <sub>Built with ❤️ by the ADR Lab Team</sub>
</div>
