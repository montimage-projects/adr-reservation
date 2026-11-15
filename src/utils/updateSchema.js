import { db } from '../lib/firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';

/**
 * Backfills missing fields on existing Firestore documents.
 * Import and call it from app code; it uses the browser Firebase client, so it
 * cannot be run directly with node.
 */
async function updateSchema() {
  console.log('Updating Firebase schema...');

  try {
    // In Firebase/Firestore, we don't need to explicitly define schema
    // But we can update existing documents to ensure they have required fields
    
    // Example: Ensure all reservations have a reference field
    const reservationsRef = collection(db, 'reservations');
    const snapshot = await getDocs(reservationsRef);
    
    if (snapshot.empty) {
      console.log('No reservations found to update');
      return;
    }
    
    const batch = writeBatch(db);
    let updateCount = 0;
    
    snapshot.forEach((document) => {
      const data = document.data();
      
      // If reference field is missing, add it with a generated value
      if (!data.reference) {
        const docRef = doc(db, 'reservations', document.id);
        const reference = `REF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        
        batch.update(docRef, { reference });
        updateCount++;
      }
    });
    
    if (updateCount > 0) {
      await batch.commit();
      console.log(`Schema update successful! Added reference field to ${updateCount} reservations.`);
    } else {
      console.log('All reservations already have a reference field. No updates needed.');
    }
  } catch (error) {
    console.error('Error updating schema:', error);
  }
}

export default updateSchema;